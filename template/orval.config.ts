import { defineConfig } from "orval";

/**
 * 生成规则(§2.7):
 * ① **按 tag 过滤** —— 只生成这个项目用到的模块(现在只有 auth)。
 *    全量生成会把用不到的端点全塞进来:噪音大、类型看不过来。
 * ② 产物**提交进仓库**、**不手改** —— 后端改字段,diff 里直接可见;
 *    CI 跑一遍 `npm run gen && git diff --exit-code` 就能拦破坏性变更。
 * ③ 横切逻辑全部走 mutator(client.ts),生成物零手写。
 *
 * input 是 dev 的本地后端(springdoc 只在 dev profile 开)。
 */
export default defineConfig({
  template: {
    input: {
      target: "http://127.0.0.1:8080/v3/api-docs",
      filters: { tags: ["auth"] },
    },
    output: {
      target: "./src/api/generated",
      schemas: "./src/api/generated/models",
      mode: "tags-split",
      client: "vue-query",
      // ⚠️ 和 client 是**两个独立选项**:client 选 query 库,httpClient 选 HTTP 底座。
      // 默认 'fetch' 会生成 (url, {body, headers}) 风格 + {data,status,headers} 信封类型,
      // 与我们「config 对象 + 返回裸体」的 mutator 对不上(类型直接红)。实测键名。
      httpClient: "axios",
      clean: true,
      override: {
        mutator: { path: "./src/api/client.ts", name: "customInstance" },
      },
    },
  },
});
