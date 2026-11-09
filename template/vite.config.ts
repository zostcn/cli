import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * 环境变量纪律,三条:
 * ① `VITE_*` 里出现 SECRET/KEY/PASSWORD/TOKEN → 构建期直接 throw。
 *    密钥放进前端产物等于公开 —— 产物人人可见,谁都能从 bundle 里翻出来。
 * ② 只提交 `.env.example`;`.env`(本地)在 .gitignore 里。
 * ③ `VITE_API_BASE_URL` 生产期必须留空 → axios 打相对路径 `/api`,与页面同源。
 *    写死绝对地址时页面若开在 `www.zost.cn`,请求就跨源到 `zost.cn` ——
 *    主块 CSP 的 `connect-src 'self'` 直接拒发,后端也没有 CORS 头兜底。
 *
 * dev 代理:仓库里不建 `.env.development`,代理目标写死在这里 ——
 * `VITE_API_BASE_URL` 为空即走代理。
 * 同站转发,cookie(ZOST_SESSION / XSRF-TOKEN, SameSite=lax)保持第一方,CSRF 流程照常。
 */
function secretScanEnv(env: Record<string, string>, mode: string): Plugin {
  const forbidden = /(SECRET|KEY|PASSWORD|TOKEN)/i;
  const hits = Object.keys(env).filter((k) => forbidden.test(k));
  if (hits.length > 0) {
    throw new Error(
      `[B12] VITE_* 环境变量禁止携带密钥语义,命中: ${hits.join(", ")}`,
    );
  }
  if (mode === "production" && env.VITE_API_BASE_URL) {
    throw new Error(
      "[B12] 生产构建禁止设置 VITE_API_BASE_URL —— 必须留空走同源相对路径(见 .env.example)",
    );
  }
  return {
    name: "zost-secret-scan",
    config(_config, { mode: m }) {
      // 仅执行校验,不改配置
      void m;
      return {};
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const useProxy = !env.VITE_API_BASE_URL;

  return {
    base: "/",
    plugins: [secretScanEnv(env, mode), vue(), tailwindcss()],
    server: useProxy
      ? {
          proxy: {
            // changeOrigin: false —— 保持 Host,后端按 127.0.0.1:8080 就够
            "/api": { target: "http://127.0.0.1:8080", changeOrigin: false },
          },
        }
      : undefined,
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
