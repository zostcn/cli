import { defineStore } from 'pinia';
import { fetchUser, login, logout as logoutAdapter } from '@/api/auth';
import { emitAuthCleared, onAuthCleared } from '@/api/memory';
import { ApiError } from '@/api/types';
import type { MeUserVO } from '@/api/generated/models';

/**
 * 认证状态 —— **只存内存**(B5):刷新即丢,权威来源永远是 `GET /api/auth/me`。
 * 刻意**不用 persist**:持久化的 user 是一份会过期的真相,
 * 而 persist 一旦开着,以后加字段默认全被写进 storage(omit 黑名单的老问题)。
 * CSRF token 同理只在 memory.ts,不进 store(避免 devtools 里直接可见)。
 */
export const useSystemStore = defineStore('system', {
  state: () => ({
    user: null as MeUserVO | null,
    bootstrapped: false,
    /** 守卫注册动态路由的完成标记 —— 只在 guard 里翻转(§2.4:重建放守卫,不放登录回调)。 */
    routesReady: false,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
    roles: (state) => state.user?.roles ?? [],
    permissions: (state) => state.user?.permissions ?? [],
  },
  actions: {
    /**
     * 每次导航都调(守卫第一步,含公开页):/me 是会话与 csrfToken 的唯一权威来源。
     *
     * 错误分流是守卫 `reason=unavailable` 的前提,不能全吞:
     * `unauthorized` → 匿名(正常态,置 null);
     * **其他错误(网络断/5xx)原样上抛**,由守卫转 `/login?reason=unavailable`(§2.4)。
     */
    async bootstrap() {
      try {
        const me = await fetchUser();
        this.user = me.user ?? null;
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'unauthorized') {
          this.user = null;
        } else {
          throw e; // finally 仍会置 bootstrapped;错误交给守卫分流
        }
      } finally {
        this.bootstrapped = true;
      }
    },
    async loginAs(phone: string, password: string) {
      const me = await login(phone, password);
      this.user = me.user ?? null;
      this.routesReady = false; // 角色可能变了,下次进守卫重建动态路由
    },
    async logout() {
      try {
        await logoutAdapter();
      } finally {
        this.reset();
        emitAuthCleared();
      }
    },
    reset() {
      this.user = null;
      this.bootstrapped = false;
      this.routesReady = false;
    },
    markRoutesReady() {
      this.routesReady = true;
    },
    /** client.ts 401 时发的事件在这里落账(store 不认识 client,靠 memory.ts 解环)。 */
    bindAuthCleared() {
      onAuthCleared(() => this.reset());
    },
  },
});
