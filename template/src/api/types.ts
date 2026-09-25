/**
 * 错误形状。v2 后端:成功 = **裸 payload**,失败 = ProblemDetail(RFC 9457):
 * `{ type, title, status, detail, instance, code }` —— 没有 ResponseResult 包壳(设计文档偏离表 #2)。
 *
 * ⚠️ Spring 把 `ProblemDetail.properties` 里的键**拍平进顶层**(RFC 9457 语义,
 * 实测真实响应如此)——**不是** `properties: { code }` 嵌套。按嵌套取会永远取到
 * undefined(踩过:409 步进的 code 判不上,前端进不了步进视图)。
 */

/** 与 ProblemDetail.code 的取值对应(v2: UNAUTHORIZED/FORBIDDEN/CSRF_FAILED/RATE_LIMITED/DEVICE_VERIFICATION_REQUIRED/…)。 */
export interface ProblemDetailLike {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** 拍平在顶层的业务码,**字符串**才是 ProblemDetail 的(v1 遗留的数字 code 不是)。 */
  code?: string | number;
  [key: string]: unknown;
}

/**
 * `kind` 是**前端分流用的语义层**,由 HTTP status 推出 ——
 * B4:绝不判 `body.code`(v1 的 401 曾把 code 写成 500,判它会把「没登录」当「服务器炸了」)。
 */
export type ApiErrorKind =
  | 'unauthorized'
  | 'csrf'
  | 'forbidden'
  | 'rate_limited'
  | 'unavailable'
  | 'client'
  | 'unknown';

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  /** 元数据而已,分流不看它;排查日志时有用。 */
  readonly code?: string;
  readonly raw?: unknown;

  constructor(status: number, kind: ApiErrorKind, message: string, code?: string, raw?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.code = code;
    this.raw = raw;
  }
}
