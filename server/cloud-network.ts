import { taskSignal, checkTask } from "./task";
export const libraryFetch = (input: string, init?: RequestInit) => {
  checkTask();
  return fetch(input, { ...init, signal: taskSignal(init?.signal) });
};
