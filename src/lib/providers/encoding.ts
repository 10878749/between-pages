/** Dangdang's desktop search decodes query bytes as GBK, not UTF-8. */
let gbkBytes: Map<string, string> | undefined;
export function encodeGbkQuery(value: string): string | null {
  if (!gbkBytes) {
    gbkBytes = new Map([["€", "%80"]]);
    const decoder = new TextDecoder("gbk");
    const bytes = new Uint8Array(2);
    for (let lead = 0x81; lead <= 0xfe; lead++) {
      bytes[0] = lead;
      for (let trail = 0x40; trail <= 0xfe; trail++) {
        if (trail === 0x7f) continue;
        bytes[1] = trail;
        const char = decoder.decode(bytes);
        if (char.length === 1 && char !== "\ufffd" && !gbkBytes.has(char)) {
          gbkBytes.set(char, `%${lead.toString(16)}%${trail.toString(16)}`.toUpperCase());
        }
      }
    }
  }
  let result = "";
  for (const char of value) {
    if (char.codePointAt(0)! < 128) result += encodeURIComponent(char);
    else {
      const encoded = gbkBytes.get(char);
      // Never silently replace a rare character with '?' and search the wrong name.
      if (!encoded) return null;
      result += encoded;
    }
  }
  return result;
}
