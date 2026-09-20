import type { Quota } from "../lib/api";
export function QuotaNotice({
  quota,
  error,
  onRetry,
}: {
  quota: Quota | null;
  error: string;
  onRetry: () => void;
}) {
  const reset = quota
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(quota.resetAt)
    : "";
  return (
    <div className="quota-notice" role="status" aria-live="polite">
      {error ? (
        <>
          <span>{error}</span>
          <button onClick={onRetry}>重试</button>
        </>
      ) : quota ? (
        <>
          <span>
            {quota.unlimited ? (
              "私用测试 · 不限推敲次数"
            ) : quota.remaining ? (
              <>
                本时段推敲机会 <strong>{quota.remaining}</strong> /{" "}
                {quota.limit}
              </>
            ) : (
              "本时段推敲机会已用完"
            )}
          </span>
          <small>
            {quota.unlimited
              ? "随手抽书也不限次数"
              : `${reset} 补满 · 北京时间`}
            {quota.remaining === 0 ? " · 仍可随手抽书" : ""}
          </small>
        </>
      ) : (
        <span>正在确认次数…</span>
      )}
    </div>
  );
}
