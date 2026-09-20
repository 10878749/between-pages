import { createHmac, randomUUID } from "node:crypto";
import { Store, type State } from "./store";

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
type Control = {
  secret: string;
  models: string;
  lease: string;
  lease_until: number;
};
const LEASE_MS = 10 * 60_000;
const buckets = [
  "draws",
  "books",
  "contexts",
  "daily",
  "upgrades",
  "unlocked",
] as const;

export class PublicDatabase {
  constructor(private db: Database) {}
  async control(): Promise<Control> {
    let row = await this.db
      .prepare("SELECT * FROM control WHERE id = 1")
      .first<Control>();
    if (!row) {
      await this.db
        .prepare("INSERT OR IGNORE INTO control (id, secret) VALUES (1, ?)")
        .bind(new Store().state.secret)
        .run();
      row = await this.db
        .prepare("SELECT * FROM control WHERE id = 1")
        .first<Control>();
    }
    if (!row) throw Error("storage");
    return row;
  }
  async allow(ip: string, secret: string) {
    const now = Date.now();
    // Trusted edge IP, hashed before storage; changing browser cookies does not reset this burst limit.
    const key =
      createHmac("sha256", secret).update(ip).digest("hex") +
      ":" +
      Math.floor(now / 60_000);
    const row = await this.db
      .prepare(
        `INSERT INTO rate_limits (key, count, expires) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`,
      )
      .bind(key, now + 120_000)
      .first<{ count: number }>();
    await this.db
      .prepare("DELETE FROM rate_limits WHERE expires < ?")
      .bind(now)
      .run();
    return !!row && row.count <= 30;
  }
  async acquire() {
    const token = randomUUID();
    const result = await this.db
      .prepare(
        `UPDATE control SET lease = ?, lease_until = ?
      WHERE id = 1 AND lease_until < ?`,
      )
      .bind(token, Date.now() + LEASE_MS, Date.now())
      .run();
    return result.meta.changes === 1 ? token : null;
  }
  async load(secret: string) {
    const store = new Store(undefined, false);
    store.state.secret = secret;
    const { results } = await this.db
      .prepare("SELECT key, value FROM entries")
      .all<{ key: string; value: string }>();
    for (const row of results) {
      const split = row.key.indexOf(":");
      const bucket = row.key.slice(0, split) as (typeof buckets)[number];
      const id = row.key.slice(split + 1);
      if (buckets.includes(bucket))
        (store.state[bucket] as Record<string, unknown>)[id] = JSON.parse(
          row.value,
        );
    }
    return store;
  }
  async save(
    state: State,
    previous: Map<string, string>,
    token: string,
    models: string[],
  ) {
    // Fence every write, so an expired request can never overwrite a newer request.
    const held = await this.db
      .prepare(
        "UPDATE control SET lease_until = ?, models = ? WHERE id = 1 AND lease = ?",
      )
      .bind(Date.now() + LEASE_MS, JSON.stringify(models), token)
      .run();
    if (held.meta.changes !== 1) throw Error("lease_lost");
    const next = new Map<string, string>();
    const changes: Statement[] = [];
    for (const bucket of buckets)
      for (const [id, value] of Object.entries(state[bucket])) {
        const key = bucket + ":" + id,
          json = JSON.stringify(value);
        next.set(key, json);
        if (previous.get(key) !== json)
          changes.push(
            this.db
              .prepare(
                `INSERT INTO entries (key, value)
        SELECT ?, ? WHERE EXISTS (SELECT 1 FROM control WHERE id = 1 AND lease = ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
              )
              .bind(key, json, token),
          );
      }
    for (const key of previous.keys())
      if (!next.has(key))
        changes.push(
          this.db
            .prepare(
              `DELETE FROM entries
      WHERE key = ? AND EXISTS (SELECT 1 FROM control WHERE id = 1 AND lease = ?)`,
            )
            .bind(key, token),
        );
    for (let i = 0; i < changes.length; i += 50)
      await this.db.batch(changes.slice(i, i + 50));
    return next;
  }
  async release(token: string) {
    await this.db
      .prepare(
        "UPDATE control SET lease = ?, lease_until = 0 WHERE id = 1 AND lease = ?",
      )
      .bind("", token)
      .run();
  }
}
export function snapshot(state: State) {
  return new Map(
    buckets.flatMap((bucket) =>
      Object.entries(state[bucket]).map(
        ([id, v]) => [bucket + ":" + id, JSON.stringify(v)] as [string, string],
      ),
    ),
  );
}
