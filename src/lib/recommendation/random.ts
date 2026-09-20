export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function weightedPick<T>(
  items: { value: T; weight: number }[],
  random: () => number,
): T {
  if (!items.length) throw new Error("没有可抽取的书");
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  let n = random() * total;
  for (const item of items) {
    n -= Math.max(0, item.weight);
    if (n < 0) return item.value;
  }
  return items[items.length - 1].value;
}
