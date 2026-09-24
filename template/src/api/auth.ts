import { setCsrf } from './memory';
import { getAuthMe, postAuthLogin, postAuthLogout } from './generated';
import type { MeResponse } from './generated/models';

/**
 * 认证适配器 —— **模板里唯一需要换的文件**(§2.5)。
 *
 * 现在是**会话模式**(目标态):cookie 会话 + CSRF。
 * 要给还没迁 v2 后端的项目用,换成 `auth.jwt.ts` 里那份的 export 即可,
 * `MeResponse` 形状不变,上层(store / guard / 页面)零改动。
 *
 * csrfToken 的两个写入点:
 * ① `fetchUser`(每次 bootstrap)—— 会话建立/轮换都从 /me 权威获取;
 * ② `login` 之后 —— 登录会轮换 token,拿响应里的新值覆盖,否则下一个写请求 403。
 */
export async function fetchUser(): Promise<MeResponse> {
  const me = await getAuthMe();
  setCsrf(me.csrfToken ?? '');
  return me;
}

export async function login(phone: string, password: string): Promise<MeResponse> {
  const me = await postAuthLogin({ phone, password });
  setCsrf(me.csrfToken ?? '');
  return me;
}

export async function logout(): Promise<void> {
  await postAuthLogout();
}
