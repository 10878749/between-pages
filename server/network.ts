import { ProxyAgent, fetch as proxyFetch } from "undici";
let agent: ProxyAgent | undefined;
export function configureLibraryProxy(url: string) {
  const previous = agent;
  agent = url ? new ProxyAgent(url) : undefined;
  void previous?.close();
}
export async function libraryFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (!agent) return fetch(input, init);
  return (await proxyFetch(input, { ...init, dispatcher: agent } as Parameters<
    typeof proxyFetch
  >[1])) as unknown as Response;
}
