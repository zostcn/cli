import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * 环境变量纪律,两条:
 * ① `VITE_*` 里出现 SECRET/KEY/PASSWORD/TOKEN → 构建期直接 throw。
 *    密钥放进前端产物等于公开 —— 产物人人可见,谁都能从 bundle 里翻出来。
 * ② 只提交 `.env.example`;`.env`(本地)在 .gitignore 里。
 */
function secretScanEnv(env: Record<string, string>): Plugin {
  const forbidden = /(SECRET|KEY|PASSWORD|TOKEN)/i;
  const hits = Object.keys(env).filter((k) => forbidden.test(k));
  if (hits.length > 0) {
    throw new Error(
      `[B12] VITE_* 环境变量禁止携带密钥语义,命中: ${hits.join(", ")}`,
    );
  }
  return {
    name: "zost-secret-scan",
    config() {
      // 仅执行校验,不改配置
      return {};
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    base: "/",
    plugins: [secretScanEnv(env), vue(), tailwindcss()],
    resolve: {
      // fileURLToPath 而不是 URL.pathname:Windows 下 pathname 是 `/D:/…`,解析会坏
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.spec.ts"],
    },
  };
});
