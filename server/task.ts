import { AsyncLocalStorage } from "node:async_hooks";
const tasks = new AsyncLocalStorage<AbortSignal>();
export function withTask<T>(signal: AbortSignal, work: () => Promise<T>) {
  return tasks.run(signal, work);
}
export function taskSignal(signal?: AbortSignal | null) {
  const active = tasks.getStore();
  return active && signal
    ? AbortSignal.any([active, signal])
    : (active ?? signal ?? undefined);
}
export function checkTask() {
  tasks.getStore()?.throwIfAborted();
}
