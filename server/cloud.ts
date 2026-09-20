import { withTask } from "./task";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApi } from "./api";
import {
  configureModel,
  restoreExhaustedModels,
  exhaustedModels,
} from "./model";
import { PublicDatabase, snapshot, type Database } from "./database";

export interface Environment {
  DB: Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  DASHSCOPE_API_KEY?: string;
  BAILIAN_FREE_QUOTA_CONFIRMED?: string;
  BAILIAN_FALLBACK_FREE_QUOTA_CONFIRMED?: string;
}
const json = (error: string, status: number) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
async function handle(
  request: Request,
  env: Environment,
  controller: AbortController,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    if (!["GET", "HEAD"].includes(request.method))
      return json("请求方式不符。", 405);
    if (
      url.pathname !== "/" &&
      !/^\/(assets\/[^/]+|favicon\.svg)$/.test(url.pathname)
    )
      return json("没有这一页。", 404);
    return env.ASSETS.fetch(request);
  }
  // The public deployment has no unlock route, access code or unlimited store.
  if (
    !["/api/session", "/api/progress", "/api/draw", "/api/details"].includes(
      url.pathname,
    )
  )
    return json("没有这一页。", 404);
  if (
    request.method === "POST" &&
    (request.headers.get("X-Page-Request") !== "1" ||
      request.headers.get("Origin") !== url.origin)
  )
    return json("请求来源不符。", 403);
  if (Number(request.headers.get("Content-Length") ?? 0) > 16000)
    return json("请求过长。", 413);
  const database = new PublicDatabase(env.DB);
  let lease: string | null = null;
  let saveQueue: Promise<unknown> = Promise.resolve();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let beatQueue: Promise<unknown> = Promise.resolve();
  try {
    let control = await database.control();
    const writes =
      ["/api/draw", "/api/details"].includes(url.pathname) &&
      request.method === "POST";
    if (
      url.pathname !== "/api/progress" &&
      !(await database.allow(
        request.headers.get("CF-Connecting-IP") ?? "unknown",
        control.secret,
      ))
    )
      return json("稍歇片刻，一分钟后再来。", 429);
    if (writes) {
      lease = await database.acquire();
      if (!lease)
        return json("此刻有人正在推敲，稍后再试。不会扣除机会。", 429);
      heartbeat = setInterval(() => {
        beatQueue = beatQueue
          .then(() => database.heartbeat(lease!))
          .catch(() => controller.abort(new Error("lease_lost")));
      }, 10000);
      control = await database.control();
    }
    const store = await database.load(control.secret);
    let previous = snapshot(store.state);
    // A previous worker may have stopped mid-request. Its lease has now expired.
    if (
      writes ||
      control.lease_until <= Date.now() ||
      !control.lease.startsWith("v2:")
    ) {
      for (const draw of Object.values(store.state.draws))
        if (draw.state === "pending") draw.state = "failed";
      for (const upgrade of Object.values(store.state.upgrades))
        if (upgrade.state === "pending") upgrade.state = "failed";
    }
    configureModel(
      "bailian",
      env.BAILIAN_FREE_QUOTA_CONFIRMED === "true",
      env.BAILIAN_FALLBACK_FREE_QUOTA_CONFIRMED === "true",
    );
    restoreExhaustedModels(JSON.parse(control.models));
    const persist = () => {
      if (!lease) return;
      const state = structuredClone(store.state),
        token = lease;
      saveQueue = saveQueue.then(async () => {
        previous = await database.save(
          state,
          previous,
          token,
          exhaustedModels(),
        );
      });
      // Keep the rejection observed while the API request is running; final await still fails safely.
      void saveQueue.catch(() => {});
    };
    if (writes) {
      const change = store.change.bind(store);
      store.change = (fn) => {
        const result = change(fn);
        persist();
        return result;
      };
    }
    const headers = new Headers();
    let status = 200,
      output = "";
    const res = {
      get statusCode() {
        return status;
      },
      set statusCode(v: number) {
        status = v;
      },
      setHeader(name: string, value: string) {
        headers.set(
          name,
          name.toLowerCase() === "set-cookie" ? value + "; Secure" : value,
        );
      },
      end(value = "") {
        output = value;
      },
    };
    const req = {
      url: url.pathname + url.search,
      method: request.method,
      headers: { ...Object.fromEntries(request.headers), host: url.host },
      async *[Symbol.asyncIterator]() {
        const reader = request.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > 16000) throw Error("invalid");
            yield decoder.decode(chunk.value, { stream: true });
          }
          yield decoder.decode();
        } finally {
          reader.releaseLock();
        }
      },
    };
    await createApi(store, env.DASHSCOPE_API_KEY ?? "")(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      () => {
        status = 404;
      },
    );
    if (writes) {
      persist();
      await saveQueue;
    }
    return new Response(output, { status, headers });
  } catch (error) {
    console.error("public_request_failed", {
      route: url.pathname,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return json("暂时未能保存，请稍后重试。", 503);
  } finally {
    clearInterval(heartbeat);
    await beatQueue;
    if (lease) {
      await saveQueue.catch(() => {});
      await database.release(lease).catch(() => {});
    }
  }
}
export default {
  fetch(
    request: Request,
    env: Environment,
    context?: { waitUntil(promise: Promise<unknown>): void },
  ) {
    const controller = new AbortController();
    const deadline = setTimeout(
      () => controller.abort(new Error("task_timeout")),
      75000,
    );
    const running = withTask(controller.signal, () =>
      handle(request, env, controller),
    ).finally(() => clearTimeout(deadline));
    // A disconnected browser must not cancel the refund/release cleanup.
    context?.waitUntil(running.then(() => undefined));
    return running;
  },
};
