import axios, { AxiosError, type Method } from 'axios';
import { emitAuthCleared, getCsrf } from './memory';
import { ApiError, type ProblemDetailLike } from './types';

/**
 * 全项目**唯一**的 HTTP 出口(H3):CSRF 注入、401/403 分流、错误归一化
 * 全部只写在这里 —— orval 生成物因此可以一行手写逻辑都没有(§2.7)。
 */
export const http = axios.create({
  // 空 = dev 走 vite 代理(/api → 127.0.0.1:8080);生产 = VITE_API_BASE_URL
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15_000,
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  const token = getCsrf();
  const method = (config.method ?? 'get').toLowerCase();
  // GET/HEAD 幂等方法不注入 —— 后端的 CsrfFilter 也只查写请求,少发无用头
  if (token && method !== 'get' && method !== 'head') {
    config.headers.set('X-XSRF-TOKEN', token);
  }
  // B12 上传规则:multipart 显式 0(=不超时)。全局 15s 会把大文件中途 abort,
  // 用户看到「网络异常」而后端还在收包。**不要改全局值**,那会把快速失败变成整站假死。
  if (config.data instanceof FormData) {
    config.timeout = 0;
  }
  return config;
});

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const h = headers as { get?: (n: string) => string | null | undefined } & Record<string, unknown>;
  if (typeof h.get === 'function') {
    const v = h.get(name);
    if (v != null) return String(v);
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(h)) {
    if (key.toLowerCase() === lower && value != null) return String(value);
  }
  return undefined;
}

/** 只看 status(B4)。ProblemDetail 的 properties.code 仅作元数据带上。 */
function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return new ApiError(0, 'unknown', error instanceof Error ? error.message : String(error));
  }
  const err = error as AxiosError<ProblemDetailLike>;
  const status = err.response?.status ?? 0;
  const data = err.response?.data;
  const code = data?.properties?.code;
  const message = data?.detail ?? err.message;

  let kind: ApiError['kind'];
  if (status === 0 || status >= 500) {
    kind = 'unavailable'; // §2.4:吞 0/5xx → 跳 /login?reason=unavailable
  } else if (status === 401) {
    kind = 'unauthorized';
  } else if (status === 403) {
    // §2.4 403 分流:CSRF 失败 ≠ 权限不足 —— 提示错了用户会去找管理员
    kind = readHeader(err.response?.headers, 'X-CSRF-Failed') === 'true' ? 'csrf' : 'forbidden';
  } else if (status === 429) {
    kind = 'rate_limited';
  } else if (status >= 400) {
    kind = 'client';
  } else {
    kind = 'unknown';
  }
  return new ApiError(status, kind, message, code, data);
}

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error);
    if (apiError.kind === 'unauthorized') {
      emitAuthCleared(); // store 清态;跳转由 main.ts 注册的订阅者做
    }
    return Promise.reject(apiError);
  },
);

/**
 * orval mutator —— **参数类型必须内联写在签名里**(实测):
 * orval 解析的是 mutator 的**源码文本**,写成引用类型(`config: MutatorConfig`)
 * 它认不出 → 回落 fetch 风格,生成 `(url, {body, headers})` + `{data,status,headers}`
 * 信封类型,与拦截器返回裸体的现实对不上(类型直接红)。
 * 内联后生成 `customInstance<T>({url, method, headers, data})`,`T` 是裸数据 ——
 * 与 tab / files 两个已跑通的项目同款。
 *
 * 拦截器挂在 `http` 上,CSRF 注入 / 401 分流 / 错误归一化对生成物自动生效 ——
 * 生成物里一行手写逻辑都没有(§2.7)。
 */
export const customInstance = <T>(config: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  data?: unknown;
  params?: unknown;
  signal?: AbortSignal;
}): Promise<T> =>
  http
    .request<T>({
      url: config.url,
      method: config.method as Method,
      headers: config.headers,
      data: config.data,
      params: config.params as Record<string, unknown> | undefined,
      signal: config.signal ?? undefined,
    })
    .then((response) => response.data);
