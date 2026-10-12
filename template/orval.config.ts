import { defineConfig } from "orval";

/**
 * 生成规则:
 * ① **按 tag 过滤** —— 只生成这个项目用到的模块(模板默认 auth;按项目需要加)。
 *    全量生成会把用不到的端点全塞进来:噪音大、类型看不过来。
 * ② 产物**不进仓库**、不许手改:CI 拉 api 仓 docs/openapi.json 快照现生成,
 *    契约变更在构建期暴露;快照与后端代码的一致性由 api 仓 CI「快照滞后校验」闸保证。
 * ③ 横切逻辑全部走 mutator(client.ts),生成物零手写。
 *
 * input:本地 dev 后端(默认,springdoc 只在 dev profile 开);
 * 没起后端时 `OPENAPI_SPEC=<路径>/openapi.json npm run gen` 吃快照,与 CI 同源。
 */
export default defineConfig({
  template: {
    input: {
      target:
        process.env.OPENAPI_SPEC ?? "http://127.0.0.1:8080/v3/api-docs",
      filters: { tags: ["auth"] },
    },
    output: {
      target: "./src/api/generated",
      schemas: "./src/api/generated/models",
      mode: "tags-split",
      client: "vue-query",
      // ⚠️ 和 client 是**两个独立选项**:client 选 query 库,httpClient 选 HTTP 底座。
      // 默认 'fetch' 会生成 (url, {body, headers}) 风格 + {data,status,headers} 信封类型,
      // 与我们「config 对象 + 返回裸体」的 mutator 对不上(类型直接红)。
      httpClient: "axios",
      clean: true,
      override: {
        mutator: { path: "./src/api/client.ts", name: "customInstance" },
      },
    },
  },
});
