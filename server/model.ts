import { checkTask, taskSignal } from "./task";
// Only explicitly approved free-quota-protected versions may be used.
export let modelProvider: "bigmodel" | "bailian" = "bigmodel";
let freeQuotaConfirmed = false;
let fallbackConfirmed = false;
const exhausted = new Set<string>();
export const exhaustedModels = () => [...exhausted];
export function restoreExhaustedModels(models: string[]) {
  for (const model of models) exhausted.add(model);
}
export function modelAvailable() {
  return (
    modelProvider !== "bailian" ||
    (freeQuotaConfirmed &&
      [
        "qwen-flash",
        ...(fallbackConfirmed ? ["qwen-flash-2025-07-28"] : []),
      ].some((m) => !exhausted.has(m)))
  );
}

export function configureModel(
  provider: string,
  confirmed = false,
  fallback = false,
) {
  if (!["bigmodel", "bailian"].includes(provider))
    throw new Error("unknown_provider");
  if (
    provider !== modelProvider ||
    fallback !== fallbackConfirmed ||
    confirmed !== freeQuotaConfirmed
  )
    exhausted.clear();
  fallbackConfirmed = fallback;
  modelProvider = provider as typeof modelProvider;
  freeQuotaConfirmed = confirmed;
}
export async function complete(
  system: string,
  data: unknown,
  key: string,
  beforeAttempt?: () => void,
): Promise<unknown> {
  if (modelProvider === "bailian" && !freeQuotaConfirmed)
    throw new Error("free_quota_setup");
  if (!key) throw new Error("unconfigured");
  const models =
    modelProvider === "bailian"
      ? ["qwen-flash", ...(fallbackConfirmed ? ["qwen-flash-2025-07-28"] : [])]
      : ["glm-4.7-flash"];
  let lastError = "free_quota_exhausted";
  for (const model of models) {
    if (exhausted.has(model)) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      checkTask();
      beforeAttempt?.();
      let response: Response;
      try {
        response = await fetch(
          modelProvider === "bailian"
            ? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
            : "https://open.bigmodel.cn/api/paas/v4/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            signal: taskSignal(AbortSignal.timeout(45000)),
            body: JSON.stringify({
              model,
              stream: false,
              max_tokens: 2400,
              temperature: 0.25,
              ...(modelProvider === "bailian"
                ? { enable_thinking: false }
                : { thinking: { type: "disabled" } }),
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: system },
                { role: "user", content: JSON.stringify(data) },
              ],
            }),
          },
        );
      } catch {
        checkTask();
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        lastError = "generation_timeout";
        break;
      }
      if (response.ok) {
        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw new Error("invalid_output");
        try {
          return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        } catch {
          throw new Error("invalid_output");
        }
      }
      const errorBody = await response.json().catch(() => ({}));
      const code = String(errorBody.error?.code ?? errorBody.code ?? "");
      if (code === "AllocationQuota.FreeTierOnly") {
        exhausted.add(model);
        lastError = "free_quota_exhausted";
        break;
      }
      if (response.status === 401) throw new Error("invalid_key");
      const transient = response.status === 429 || response.status >= 500;
      const raw = response.headers?.get("retry-after");
      const seconds = raw
        ? Number.isFinite(Number(raw))
          ? Number(raw)
          : (Date.parse(raw) - Date.now()) / 1000
        : 1;
      if (attempt === 0 && transient && seconds <= 10) {
        await new Promise((r) => setTimeout(r, Math.max(1000, seconds * 1000)));
        continue;
      }
      if (transient) {
        lastError = "generation_busy";
        break;
      }
      throw new Error("generation");
    }
  }
  throw new Error(lastError);
}
