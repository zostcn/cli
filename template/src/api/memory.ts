/**
 * 内存态:CSRF token + 「认证已失效」事件总线。
 *
 * 为什么单独一个文件:
 * ① **csrfToken 只存内存,绝不落 localStorage**(做法库 A3)—— 它随会话轮换,
 *    持久化只会拿到一个过期值,而且 localStorage 是 XSS 的第一现场;
 * ② client.ts(401 时发事件)与 stores/system.ts(收事件清态)**互相不认识** ——
 *    靠这里解环,store 永远不被 client import。
 */
let csrfToken = "";

type Listener = () => void;
const authClearedListeners = new Set<Listener>();

export function setCsrf(token: string): void {
  csrfToken = token ?? "";
}

export function getCsrf(): string {
  return csrfToken;
}

export function clearCsrf(): void {
  csrfToken = "";
}

/** 401 / 登出后调用:清 token 并通知订阅者(store 复位)。 */
export function emitAuthCleared(): void {
  csrfToken = "";
  for (const listener of authClearedListeners) {
    listener();
  }
}

/** 返回退订函数。 */
export function onAuthCleared(listener: Listener): () => void {
  authClearedListeners.add(listener);
  return () => authClearedListeners.delete(listener);
}
