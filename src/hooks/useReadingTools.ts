import { useEffect, useRef } from "react";
import { tags } from "../data/tags";
import type { Book, BoxState, Selection } from "../data/types";
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: Tool,
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}
export function useReadingTools(
  state: BoxState,
  selected: Selection[],
  book?: Book,
) {
  const latest = useRef({ state, selected, book });
  useEffect(() => {
    latest.current = { state, selected, book };
  }, [state, selected, book]);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const emptyInput = (input: unknown) => {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length
      )
        throw new Error("Expected an empty object");
    };
    const tools: Tool[] = [
      {
        name: "get_reading_state",
        description:
          "Read the visible reading-box phase, selected clues and revealed book. Does not draw, save or change anything.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          emptyInput(input);
          const current = latest.current;
          return {
            phase: current.state,
            clues: current.selected.map((s) => s.label),
            book:
              current.state === "revealed" && current.book
                ? {
                    title: current.book.title,
                    author: current.book.author,
                    summary: current.book.bookSummary,
                  }
                : null,
          };
        },
      },
      {
        name: "list_reading_tags",
        description:
          "List available reading clue labels and categories without selecting them.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input) {
          emptyInput(input);
          return tags.map((t) => ({ label: t.label, category: t.category }));
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Experimental browser API must never interrupt the app. */
      }
    }
    return () => lifecycle.abort();
  }, []);
}
