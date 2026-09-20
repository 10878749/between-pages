import { build } from "esbuild";
import {
  mkdirSync,
  readdirSync,
  renameSync,
  copyFileSync,
  cpSync,
} from "node:fs";
import { resolve } from "node:path";
mkdirSync("dist/client", { recursive: true });
for (const item of readdirSync("dist"))
  if (item !== "client") renameSync("dist/" + item, "dist/client/" + item);
await build({
  entryPoints: ["server/cloud.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  external: ["node:crypto", "node:path", "node:http", "node:async_hooks"],
  plugins: [
    {
      name: "worker-network",
      setup(b) {
        b.onResolve({ filter: /^\.\/network$/ }, () => ({
          path: resolve("server/cloud-network.ts"),
        }));
        b.onResolve({ filter: /^node:fs$/ }, () => ({
          path: resolve("server/cloud-files.ts"),
        }));
      },
    },
  ],
});
mkdirSync("dist/.openai", { recursive: true });
copyFileSync(".openai/hosting.json", "dist/.openai/hosting.json");
cpSync("drizzle", "dist/.openai/drizzle", { recursive: true });
