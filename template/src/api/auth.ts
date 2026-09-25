import { setCsrf } from './memory';
import { getAuthMe, postAuthLogin, postAuthLogout, postAuthSmsLogin, postAuthSmsSend } from './generated';
import type { MeResponse } from './generated/models';

/**
 * 认证适配器 —— **模板里唯一需要换的文件**(§2.5)。
 *
 * 现在是**会话模式**(目标态):cookie 会话 + CSRF。
 * 要给还没迁 v2 后端的项目用,换成 `auth.jwt.ts` 里那份的 export 即可,
 * `MeResponse` 形状不变,上层(store / guard / 页面)零改动。
 * (短信登录是 v2 独有端点,v1/JWT 过渡态没有 —— 换 JWT 模式时这两个函数一并去掉。)
 *
 * csrfToken 的写入点:
 * ① `fetchUser`(每次 bootstrap)—— 会话建立/轮换都从 /me 权威获取;
 * ② `login` / `smsLogin` 之后 —— 登录会轮换 token,拿响应里的新值覆盖,否则下一个写请求 403。
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

/**
 * 下发短信验证码。**响应恒为空 200** —— 未注册号码后端也回 200(防手机号枚举),
 * 所以「发没发成功」只能靠手机收没收到,别拿响应做判断。
 */
export async function sendSmsCode(phone: string): Promise<void> {
  await postAuthSmsSend({ phone });
}

/** 短信验证码登录。验码通过后与密码登录拿到的是同一种会话。 */
export async function smsLogin(phone: string, code: string): Promise<MeResponse> {
  const me = await postAuthSmsLogin({ phone, code });
  setCsrf(me.csrfToken ?? '');
  return me;
}

export async function logout(): Promise<void> {
  await postAuthLogout();
}
