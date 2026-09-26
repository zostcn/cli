import { QueryClient } from "@tanstack/vue-query";
import { ApiError } from "./types";

/**
 * vue-query 的**模板级默认值** —— 生成的项目开箱继承,不用每个项目重配一遍。
 *
 * 两条默认:
 * ① `staleTime: 30s` —— 默认 0 会让切窗口 refocus、重复挂载都重新拉,
 *    列表页在来回切 tab 时打成串;
 * ② `retry` **4xx 不重试** —— 后端已给出确定答复,重试只是多打几次:
 *    401 还会连发几轮 `auth-cleared` 事件,429 限流更是越重试越糟。
 *    只重试「服务端暂时性失败」(unavailable = 网络断/5xx)与未知错误。
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const kind = error instanceof ApiError ? error.kind : undefined;
          const retriable =
            kind === undefined || kind === "unavailable" || kind === "unknown";
          return retriable && failureCount < 3;
        },
      },
    },
  });
}
