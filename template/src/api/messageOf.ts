import { ApiError } from "./types";

/**
 * ApiError → 用户可见文案。登录 / 注册 / 改密页共用一份 ——
 * 分流语义见 `client.ts`（kind 只由 HTTP status 推出，B4）。
 *
 * `fallback` 给调用场景留一句话术（登录页传「手机号或密码错误」这类场景兜底）。
 */
export function messageOf(
  e: unknown,
  fallback = "操作失败，请稍后再试",
): string {
  if (!(e instanceof ApiError)) return fallback;
  switch (e.kind) {
    case "unauthorized":
      // 401 的后端 detail 才是权威文案（密码错/锁定/禁用都在里面）
      return e.message || fallback;
    case "rate_limited":
      return "请求过于频繁，请稍后再试";
    case "csrf":
      return "会话校验失败，请刷新页面重试";
    case "client":
      return e.message || fallback;
    default:
      return "服务暂不可用，请稍后再试";
  }
}
