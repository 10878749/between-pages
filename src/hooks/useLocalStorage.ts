import { useState, useCallback } from "react";
export function useLocalStorage<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
) {
  const [unavailable, setUnavailable] = useState(false);
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed: unknown = JSON.parse(raw);
      return validate(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const result =
          typeof next === "function" ? (next as (p: T) => T)(previous) : next;
        try {
          localStorage.setItem(key, JSON.stringify(result));
        } catch {
          queueMicrotask(() => setUnavailable(true));
        }
        return result;
      });
    },
    [key],
  );
  return [value, update, unavailable] as const;
}
