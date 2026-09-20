import { configureModel } from "./server/model";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { Store } from "./server/store";
import { createApi } from "./server/api";
import { configureLibraryProxy } from "./server/network";
import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const provider = env.MODEL_PROVIDER || "bigmodel";
  if (mode !== "test")
    configureModel(
      provider,
      env.BAILIAN_FREE_QUOTA_CONFIRMED === "true",
      env.BAILIAN_FALLBACK_FREE_QUOTA_CONFIRMED === "true",
    );
  const privatePlay = mode === "play";
  let accessKey = "";
  if (privatePlay) {
    const file = resolve(process.cwd(), ".local-data/play-access.txt");
    mkdirSync(resolve(process.cwd(), ".local-data"), { recursive: true });
    if (!existsSync(file))
      writeFileSync(file, randomBytes(18).toString("base64url"), {
        mode: 0o600,
      });
    accessKey = readFileSync(file, "utf8").trim();
  }
  if (mode !== "test") configureLibraryProxy(env.LIBRARY_PROXY_URL ?? "");
  let api: ReturnType<typeof createApi> | undefined;
  const middleware = () =>
    (api ??= createApi(
      new Store(
        resolve(
          process.cwd(),
          privatePlay
            ? ".local-data/play-state.json"
            : ".local-data/state.json",
        ),
        privatePlay,
      ),
      (provider === "bailian" ? env.DASHSCOPE_API_KEY : env.BIGMODEL_API_KEY) ??
        "",
      {},
      accessKey,
    ));
  const backend: Plugin = {
    name: "between-pages-local-api",
    configureServer(server) {
      server.middlewares.use(middleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware());
    },
  };
  return {
    plugins: [react(), backend],
    server: {
      fs: {
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem}",
          "**/.git/**",
          "**/.local-data/**",
          ...(mode === "test" ? [] : ["**/server/**"]),
        ],
      },
    },
  };
});
