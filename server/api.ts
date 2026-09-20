import { hasReadingEvidence } from "../src/lib/providers/quality";
import { modelProvider, modelAvailable } from "./model";
import {
  createHmac,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Store, selections, day, type SavedDraw } from "./store";
import { discover } from "../src/lib/providers/discovery";
import { mergeBooks, type CatalogBook } from "../src/lib/providers/catalog";
import { recommend } from "../src/lib/recommendation/recommendation";
import { libraryFetch } from "./network";
import { generateDetails, gatherEvidence, DETAILS_VERSION } from "./details";
import { candidatePool, selectBook } from "./selection";
const defaults = { discover, generateDetails, gatherEvidence, selectBook };
export function createApi(
  store: Store,
  key: string,
  overrides: Partial<typeof defaults> = {},
  accessKey = "",
) {
  if (store.unlimited && !accessKey) throw new Error("private_access_required");
  const deps = { ...defaults, ...overrides };
  let generating = false,
    cooldown = 0;
  const active = new Map<string, Promise<void>>();
  const cookieName = store.unlimited ? "bp_play_visitor" : "bp_visitor";
  const sign = (id: string) =>
    createHmac("sha256", store.state.secret).update(id).digest("hex");
  const equals = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  function identity(req: IncomingMessage, res: ServerResponse, create = false) {
    const raw =
      req.headers.cookie?.match(
        new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`),
      )?.[1] ?? "";
    const [id, sig] = raw.split(".");
    if (
      id &&
      /^[\da-f-]{36}$/.test(id) &&
      sig?.length === 64 &&
      equals(sign(id), sig)
    )
      return id;
    if (!create) throw new Error("identity");
    const fresh = randomUUID();
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${fresh}.${sign(fresh)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
    );
    return fresh;
  }
  function send(res: ServerResponse, status: number, data: unknown) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(data));
  }
  async function body(req: IncomingMessage) {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 16000) throw new Error("invalid");
    }
    return JSON.parse(text);
  }
  function publicDraw(d?: SavedDraw) {
    if (!d) return null;
    return {
      id: d.id,
      book: d.book,
      draw: d.draw,
      cached: d.cached,
      mode: d.mode ?? "smart",
      unlocked:
        d.mode !== "light" ||
        !!store.state.unlocked[d.owner + ":" + d.book?.id],
      ...(store.unlimited ? { diagnostic: d.diagnostic } : {}),
    };
  }
  function beforeAttempt() {
    store.change((s) => {
      const date = day(Date.now());
      s.daily[date] = (s.daily[date] ?? 0) + 1;
    });
  }
  function available() {
    if (!key) throw new Error("unconfigured");
    if (!modelAvailable()) throw new Error("free_quota_exhausted");
    if (generating || Date.now() < cooldown) throw new Error("generation_busy");
  }
  return async function handler(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    const path = req.url?.split("?")[0];
    if (!path?.startsWith("/api/")) return next();
    try {
      if (
        req.method === "POST" &&
        (req.headers["x-page-request"] !== "1" ||
          (req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host))
      )
        return send(res, 403, { error: "请求来源不符。" });
      const owner = identity(
        req,
        res,
        path === "/api/session" && req.method === "GET",
      );
      if (store.unlimited) {
        const auth =
          req.headers.cookie?.match(/(?:^|;\s*)bp_play_access=([^;]+)/)?.[1] ??
          "";
        if (path === "/api/unlock" && req.method === "POST") {
          const input = await body(req);
          if (
            typeof input.code !== "string" ||
            !equals(
              createHash("sha256").update(input.code).digest("hex"),
              createHash("sha256").update(accessKey).digest("hex"),
            )
          )
            return send(res, 403, { error: "口令不符。" });
          res.setHeader(
            "Set-Cookie",
            `bp_play_access=${sign("play:" + owner + accessKey)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
          );
          return send(res, 200, { ok: true });
        }
        if (!equals(auth, sign("play:" + owner + accessKey)))
          return send(res, path === "/api/session" ? 200 : 403, {
            locked: true,
            error: "请输入私用口令。",
          });
      }
      if (path === "/api/session" && req.method === "GET")
        return send(res, 200, {
          quota: store.quota(owner),
          latest: publicDraw(store.latest(owner)),
          aiConfigured: !!key,
          smartAvailable: modelAvailable(),
        });
      if (path === "/api/progress" && req.method === "POST") {
        const input = await body(req);
        const d = store.state.draws[owner + ":" + input.id];
        return send(res, 200, { phase: d?.phase ?? "正在找书" });
      }
      if (path === "/api/draw" && req.method === "POST") {
        const input = await body(req);
        if (
          typeof input.id !== "string" ||
          !/^[\da-f-]{36}$/.test(input.id) ||
          (input.mode !== undefined && !["smart", "light"].includes(input.mode))
        )
          throw new Error("invalid");
        const clues = selections(input.clues),
          mode = input.mode === "light" ? "light" : "smart";
        const id = input.id,
          token = owner + ":" + id;
        const existing = store.state.draws[token];
        if (existing && existing.mode && existing.mode !== mode)
          throw new Error("invalid");
        const reservation = store.reserve(owner, id, Date.now(), mode);
        if (reservation.state === "pending" && !active.has(token)) {
          const job = (async () => {
            await Promise.resolve();
            let ownsGeneration = false;
            const started = Date.now();
            try {
              if (mode === "smart") {
                available();
                generating = true;
                ownsGeneration = true;
              }
              store.change((s) => {
                s.draws[token].phase = "正在找书";
              });
              const pool = await deps.discover(
                clues,
                store.state.books,
                AbortSignal.timeout(30000),
                libraryFetch,
              );
              const recent = Object.values(store.state.draws)
                .filter((d) => d.owner === owner && d.book)
                .sort((a, b) => b.time - a.time)
                .map((d) => d.book!.id);
              // Evidence admission applies equally to both modes, before ranking.
              const shortlist = candidatePool(
                pool.books,
                clues,
                recent,
                Math.random,
                48,
              );
              const candidates: typeof shortlist = [];
              store.change((s) => {
                s.draws[token].phase = "正在核对书目";
              });
              for (
                let offset = 0;
                offset < shortlist.length && candidates.length < 16;
                offset += 8
              ) {
                const batch = await Promise.all(
                  shortlist.slice(offset, offset + 8).map(async (book) => {
                    const b = { ...book };
                    try {
                      const evidence = await deps.gatherEvidence(b);
                      b.bookSummary = evidence.summary;
                      b.sourceEvidence = {
                        ...evidence,
                        checkedAt: new Date().toISOString(),
                      };
                    } catch {
                      return null;
                    }
                    return hasReadingEvidence(b) ? b : null;
                  }),
                );
                candidates.push(
                  ...batch.filter(
                    (b): b is NonNullable<typeof b> => b !== null,
                  ),
                );
              }
              if (!candidates.length) throw new Error("no_readable_candidates");
              let result;
              if (mode === "smart") {
                store.change((s) => {
                  s.draws[token].phase = "正在比较线索";
                });
                let ranked;
                try {
                  ranked = await deps.selectBook(
                    candidates.slice(0, 8),
                    clues,
                    key,
                    Math.random,
                    beforeAttempt,
                  );
                } catch (error) {
                  if (
                    !(error instanceof Error) ||
                    error.message !== "no_match" ||
                    candidates.length <= 8
                  )
                    throw error;
                  ranked = await deps.selectBook(
                    candidates.slice(8, 16),
                    clues,
                    key,
                    Math.random,
                    beforeAttempt,
                  );
                }
                result = ranked;
                store.change((s) => {
                  s.draws[token].diagnostic = {
                    rankings: ranked.rankings,
                    elapsedMs: Date.now() - started,
                    cached: pool.cached,
                  };
                });
              } else result = recommend(clues, recent, Math.random, candidates);
              store.change((s) => {
                s.books = mergeBooks([
                  ...candidates,
                  ...s.books.filter(hasReadingEvidence),
                ]).slice(0, 500) as CatalogBook[];
              });
              store.finish(
                owner,
                id,
                result.book,
                {
                  bookId: result.book.id,
                  time: Date.now(),
                  selections: clues,
                  matched: result.matched,
                  exploration: result.exploration,
                  mode,
                },
                pool.cached,
              );
              if (mode === "smart")
                store.change((s) => {
                  s.unlocked[owner + ":" + result.book.id] = true;
                });
            } catch (error) {
              const code = error instanceof Error ? error.message : "failure";
              if (code === "generation_busy") cooldown = Date.now() + 15000;
              store.fail(owner, id);
              store.change((s) => {
                s.draws[token].phase = code;
                s.draws[token].diagnostic = {
                  error: code,
                  elapsedMs: Date.now() - started,
                };
              });
            } finally {
              if (ownsGeneration) generating = false;
              active.delete(token);
            }
          })();
          active.set(token, job);
        }
        await active.get(token);
        const result = store.state.draws[token];
        if (result.state !== "done")
          return send(res, 503, {
            error: [
              "no_readable_candidates",
              "no_candidates",
              "no_match",
            ].includes(result.phase ?? "")
              ? "这批书还不够合适，暂未拆封。请再试一次；推敲机会已退回。"
              : mode === "smart"
                ? result.phase === "free_quota_setup"
                  ? "请先在百炼开启免费额度用完即停，并完成本地配置。机会已退回。"
                  : result.phase === "free_quota_exhausted"
                    ? "百炼免费额度已用完或到期，机会已退回。仍可随手抽书。"
                    : result.phase === "invalid_key"
                      ? "接入密钥未通过验证，请检查本地配置。机会已退回。"
                      : "这次未能完成推敲，机会已退回。可以重试，或换成随手抽书。"
                : "暂时连不上书库，请稍后再试。",
            quota: store.quota(owner),
          });
        return send(res, 200, {
          result: publicDraw(result),
          quota: store.quota(owner),
        });
      }
      if (path === "/api/details" && req.method === "POST") {
        const input = await body(req),
          token = owner + ":" + input.id;
        const d = store.state.draws[token];
        if (!d || d.state !== "done" || !d.book || !d.draw)
          return send(res, 404, { error: "找不到这次抽取。" });
        const needsUnlock =
          d.mode === "light" && !store.state.unlocked[owner + ":" + d.book.id];
        if (needsUnlock && input.upgrade !== true)
          return send(res, 200, {
            status: "locked",
            quota: store.quota(owner),
          });
        const cacheKey =
          modelProvider +
          ":" +
          DETAILS_VERSION +
          ":" +
          createHash("sha256")
            .update(
              JSON.stringify([
                d.book.id,
                d.draw.selections.map((c) => [c.label, c.tagIds]).sort(),
                d.draw.exploration,
                d.mode,
              ]),
            )
            .digest("hex");
        if (store.state.contexts[cacheKey]) {
          if (needsUnlock) {
            store.reserveUpgrade(owner, d.book.id);
            store.finishUpgrade(owner, d.book.id, true);
          }
          return send(res, 200, {
            status: "ready",
            details: store.state.contexts[cacheKey],
            quota: store.quota(owner),
          });
        }
        if (
          input.peek === true ||
          (d.mode === "light" && input.upgrade !== true)
        )
          return send(res, 200, {
            status: "locked",
            unlocked: !needsUnlock,
            quota: store.quota(owner),
          });
        try {
          available();
        } catch (e) {
          const code = (e as Error).message;
          return send(res, 200, {
            status:
              code === "unconfigured"
                ? "unconfigured"
                : code === "daily_limit"
                  ? "limited"
                  : "busy",
            message:
              code === "free_quota_exhausted"
                ? "免费推敲额度已用完，暂时无法推敲。仍可随手抽书。"
                : code === "unconfigured"
                  ? "推敲尚未接通，可以先随手抽书。"
                  : "推敲暂时忙碌，稍后再试。这次不扣机会。",
            quota: store.quota(owner),
          });
        }
        if (
          d.attempts > 0 &&
          d.detailsVersion === DETAILS_VERSION &&
          input.retry !== true &&
          input.upgrade !== true
        )
          return send(res, 200, {
            status: "failed",
            message: "介绍尚未整理好，可手动重试，不另扣机会。",
            quota: store.quota(owner),
          });
        if (
          (!store.unlimited &&
            d.detailsVersion === DETAILS_VERSION &&
            d.attemptDay === day(Date.now()) &&
            d.attempts >= 3) ||
          (d.detailsVersion === DETAILS_VERSION &&
            d.lastAttempt &&
            Date.now() - d.lastAttempt < 15000)
        )
          return send(res, 200, {
            status: "limited",
            message: "歇一会儿，再来推敲。",
            quota: store.quota(owner),
          });
        if (needsUnlock) store.reserveUpgrade(owner, d.book.id);
        generating = true;
        const started = Date.now();
        try {
          store.change((s) => {
            const r = s.draws[token];
            if (
              r.attemptDay !== day(Date.now()) ||
              r.detailsVersion !== DETAILS_VERSION
            )
              r.attempts = 0;
            r.detailsVersion = DETAILS_VERSION;
            r.attemptDay = day(Date.now());
            r.attempts++;
            r.lastAttempt = Date.now();
          });
          const genericKey =
            modelProvider + ":" + DETAILS_VERSION + ":book:" + d.book.id;
          const details = await deps.generateDetails(
            d.book,
            d.draw,
            key,
            store.state.contexts[genericKey],
            beforeAttempt,
          );
          store.change((s) => {
            s.contexts[cacheKey] = details;
            if (details.summary && details.authorBio)
              s.contexts[genericKey] = { ...details, why: "" };
          });
          store.finishUpgrade(owner, d.book.id, true);
          return send(res, 200, {
            status: "ready",
            details,
            quota: store.quota(owner),
            ...(store.unlimited
              ? { diagnostic: { elapsedMs: Date.now() - started } }
              : {}),
          });
        } catch (error) {
          if (needsUnlock) store.finishUpgrade(owner, d.book.id, false);
          const code = error instanceof Error ? error.message : "failure";
          if (code === "generation_busy") cooldown = Date.now() + 15000;
          return send(res, 200, {
            status: code === "generation_busy" ? "busy" : "failed",
            message:
              code === "free_quota_exhausted"
                ? "推敲暂不可用，免费额度已用完。仍可随手抽书。"
                : code === "insufficient_evidence"
                  ? "这本书的资料还不够，暂时写不出可靠的介绍。"
                  : code === "invalid_content_evidence"
                    ? "介绍还没通过资料核对，可以重试，不另扣机会。"
                    : "这次没能整理好，稍后可以重试。",
            quota: store.quota(owner),
            ...(store.unlimited
              ? { diagnostic: { error: code, elapsedMs: Date.now() - started } }
              : {}),
          });
        } finally {
          generating = false;
        }
      }
      send(res, 404, { error: "没有这个接口。" });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "";
      send(
        res,
        reason === "quota"
          ? 429
          : reason === "pending"
            ? 409
            : reason === "identity"
              ? 401
              : 400,
        {
          error:
            reason === "quota"
              ? "本时段的推敲机会已用完，仍可随手抽书。"
              : reason === "pending"
                ? "已有一本正在拆开，请稍候。"
                : reason === "identity"
                  ? "请刷新后再试。"
                  : "请求未完成，请重试。",
        },
      );
    }
  };
}
