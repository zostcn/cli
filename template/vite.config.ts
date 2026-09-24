import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * B12 环境变量纪律,两条:
 * ① `VITE_*` 里出现 SECRET/KEY/PASSWORD/TOKEN → 构建期直接 throw。
 *    前端产物人人可见,密钥放进来等于公开 —— v1 的 jwt.secret 就是这么泄的。
 * ② 只提交 `.env.example`;`.env`(本地)在 .gitignore 里。
 *
 * dev 代理:模板刻意**不建 `.env.development`**(B12 只允许 .env.example),
 * 代理目标写死在这里 —— `VITE_API_BASE_URL` 为空即走代理。
 * 同站转发,cookie(ZOST_SESSION / XSRF-TOKEN, SameSite=lax)保持第一方,CSRF 流程照常。
 */
function secretScanEnv(env: Record<string, string>, mode: string): Plugin {
  const forbidden = /(SECRET|KEY|PASSWORD|TOKEN)/i;
  const hits = Object.keys(env).filter((k) => forbidden.test(k));
  if (hits.length > 0) {
    throw new Error(`[B12] VITE_* 环境变量禁止携带密钥语义,命中: ${hits.join(', ')}`);
  }
  if (mode === 'production' && !env.VITE_API_BASE_URL) {
    throw new Error('[B12] 生产构建必须显式设置 VITE_API_BASE_URL(见 .env.example)');
  }
  return {
    name: 'zost-secret-scan',
    config(_config, { mode: m }) {
      // 仅执行校验,不改配置
      void m;
      return {};
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const useProxy = !env.VITE_API_BASE_URL;

  return {
    base: '/',
    plugins: [secretScanEnv(env, mode), vue(), tailwindcss()],
    server: useProxy
      ? {
          proxy: {
            // changeOrigin: false —— 保持 Host,后端按 127.0.0.1:8080 就够
            '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false },
          },
        }
      : undefined,
    resolve: {
      // fileURLToPath 而不是 URL.pathname:Windows 下 pathname 是 `/D:/…`,解析会坏
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
    },
  };
});
