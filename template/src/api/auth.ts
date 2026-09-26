import { setCsrf } from "./memory";
import {
  getAuthMe,
  postAuthLogin,
  postAuthLogout,
  postAuthPassword,
  postAuthRegister,
  postAuthSmsLogin,
  postAuthSmsSend,
} from "./generated";
import type { MeResponse } from "./generated/models";

/**
 * 认证适配器 —— **模板里唯一需要换的文件**(§2.5)。
 *
 * 这份是**会话模式**(模板默认,同站项目直接用):cookie 会话 + CSRF。
 * 跨站项目(tab 扩展 / electron / blog)换 `auth.token.ts` 的 Bearer 通道 ——
 * `MeResponse` 形状不变,store / guard 对通道无感;但登录 / 注册 / 账号安全页
 * 与 store 的三个登录动作要一并删(令牌通道没有那些入口),见 README。
 *
 * csrfToken 的写入点:
 * ① `fetchUser`(每次 bootstrap)—— 会话建立/轮换都从 /me 权威获取;
 * ② `login` / `smsLogin` / `register` 之后 —— 这三条通道都轮换 token,
 *    拿响应里的新值覆盖,否则下一个写请求 403。
 */
export async function fetchUser(): Promise<MeResponse> {
  const me = await getAuthMe();
  setCsrf(me.csrfToken ?? "");
  return me;
}

export async function login(
  phone: string,
  password: string,
): Promise<MeResponse> {
  const me = await postAuthLogin({ phone, password });
  setCsrf(me.csrfToken ?? "");
  return me;
}

/**
 * 下发短信验证码。**响应恒为空 200** —— 两种 purpose 下后端都不泄漏账号存在性,
 * 所以「发没发成功」只能靠手机收没收到,别拿响应做判断。
 *
 * @param purpose 缺省 `login`(只给已注册号码发);`register` 一律发(含已注册 ——
 *                已注册用户拿码提交后才能看到「该手机号已注册」的引导)。
 */
export async function sendSmsCode(
  phone: string,
  purpose?: "login" | "register",
): Promise<void> {
  await postAuthSmsSend({ phone, purpose });
}

/** 短信验证码登录。验码通过后与密码登录拿到的是同一种会话。 */
export async function smsLogin(
  phone: string,
  code: string,
): Promise<MeResponse> {
  const me = await postAuthSmsLogin({ phone, code });
  setCsrf(me.csrfToken ?? "");
  return me;
}

/** 注册(短信验证码换账号)。**即注册即登录** —— 响应与登录同形,处理同款。 */
export async function register(
  phone: string,
  code: string,
  password: string,
): Promise<MeResponse> {
  const me = await postAuthRegister({ phone, code, password });
  setCsrf(me.csrfToken ?? "");
  return me;
}

/**
 * 改密码(已登录会话内)。凭据**二选一**(与后端 ChangePasswordRequest 对应):
 * `oldPassword`(知道当前密码)或 `code`(新鲜短信验证码,给忘密码的用户)。
 * 成功后服务端作废该用户的**其他**会话、保留当前 —— 本端状态不变,不用清 store。
 */
export async function changePassword(body: {
  oldPassword?: string;
  newPassword: string;
  code?: string;
}): Promise<void> {
  await postAuthPassword(body);
}

export async function logout(): Promise<void> {
  await postAuthLogout();
}
