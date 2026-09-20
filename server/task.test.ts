import { it, expect } from "vitest";
import { withTask, taskSignal, checkTask } from "./task";
it("aborting one request cancels its child calls without canceling another request", async () => {
  const first = new AbortController(),
    second = new AbortController();
  let child: AbortSignal | undefined;
  const one = withTask(first.signal, async () => {
    child = taskSignal(AbortSignal.timeout(10000));
    await Promise.resolve();
    expect(() => checkTask()).toThrow("task_timeout");
  });
  const two = withTask(second.signal, async () => {
    await Promise.resolve();
    expect(() => checkTask()).not.toThrow();
    expect(taskSignal()?.aborted).toBe(false);
  });
  first.abort(new Error("task_timeout"));
  await Promise.all([one, two]);
  expect(child?.aborted).toBe(true);
  expect(taskSignal()).toBeUndefined();
});
