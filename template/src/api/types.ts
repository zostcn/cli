/**
 * 错误形状。v2 后端:成功 = **裸 payload**,失败 = ProblemDetail(RFC 9457):
 * `{ type, title, status, detail, instance, code }` —— 没有 ResponseResult 包壳。
 *
 * ⚠️ Spring 把 `ProblemDetail.properties` 里的键**拍平进顶层**(RFC 9457 语义)
 * ——**不是** `properties: { code }` 嵌套。按嵌套取会永远取到 undefined。
 */

/** 与 ProblemDetail.code 的取值对应(v2: UNAUTHORIZED/FORBIDDEN/CSRF_FAILED/RATE_LIMITED/DEVICE_VERIFICATION_REQUIRED/…)。 */
export interface ProblemDetailLike {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** 拍平在顶层的业务码,**字符串**才是 ProblemDetail 的(数字 code 不是)。 */
  code?: string | number;
  [key: string]: unknown;
}

/**
 * `kind` 是**前端分流用的语义层**,由 HTTP status 推出 ——
 * 绝不判 `body.code`:code 只是随 body 带的元数据,与真实 status 脱节时判它,
 * 就会把「没登录」误判成服务器故障(或反过来)。
 */
export type ApiErrorKind =
  | "unauthorized"
  | "csrf"
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "client"
  | "unknown";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  /** 元数据而已,分流不看它;排查日志时有用。 */
  readonly code?: string;
  readonly raw?: unknown;

  constructor(
    status: number,
    kind: ApiErrorKind,
    message: string,
    code?: string,
    raw?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    this.code = code;
    this.raw = raw;
  }
}
