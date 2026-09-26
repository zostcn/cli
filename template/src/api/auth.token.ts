import { http } from "./client";
import type { MeResponse } from "./generated/models";

/**
 * v2 Bearer 令牌适配器 —— **跨站客户端专用**(tab 扩展 / electron / blog),
 * 与会话适配器 `auth.ts` 二选一,休眠中、不被引用。
 *
 * 为什么跨站必须换这条:`SameSite=Lax` 的 cookie 在跨站请求上**根本不会被发送** ——
 * 这是浏览器规则,不是配置问题。令牌通道的形态(后端 `OpaqueTokenAuthenticationFilter`):
 * 不透明随机串(DB 存哈希,可即时吊销)、**无会话、无 refresh**、带 `Authorization` 的请求
 * 免 CSRF(`BearerRequestMatcher` 豁免,跨源 JS 无法不经预检设置该头 —— 豁免的正当理由)。
 *
 * 换法见 README「跨站项目换令牌通道」:`auth.ts` 的 export 换成这里的,
 * 登录 / 注册 / 账号安全页与 store 的三个登录动作一并删 —— 令牌通道没有那些入口。
 *
 * ⚠️ **首个令牌怎么拿,v2 还没有匿名端点**:`POST /api/auth/token/issue` 要求已有登录态。
 * 本文件只覆盖「已有令牌如何携带」,首签方式迁跨站项目时再定。
 */
const TOKEN_KEY = "access_token";

/** 拿到令牌(raw)后调一次。原始令牌只在客户端,服务端只存 SHA-256。 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 与会话适配器同名同形状 —— store / guard 不知道自己跑在哪条通道上。
 * 无令牌 = 直接匿名、不打网络;令牌失效/被吊销则 `/me` 回 401,
 * 上层按 `unauthorized` 归一成匿名(同会话模式),下次导航再真打一次。
 */
export async function fetchUser(): Promise<MeResponse> {
  if (!localStorage.getItem(TOKEN_KEY)) {
    return {}; // user 缺省 = 匿名(上层一律 `me.user ?? null`)
  }
  const { data } = await http.get<MeResponse>("/api/auth/me", {
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
  });
  return data;
}

/**
 * 只清本地令牌 —— 令牌通道**没有会话可登出**。
 * 服务端吊销走管理页的 `POST /api/auth/token/revoke`(吊销后下次请求即失效)。
 */
export async function logout(): Promise<void> {
  clearToken();
}
