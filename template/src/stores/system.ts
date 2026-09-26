import { defineStore } from 'pinia';
import { fetchUser, login, logout as logoutAdapter, register as registerAdapter, smsLogin } from '@/api/auth';
import { emitAuthCleared, onAuthCleared } from '@/api/memory';
import { ApiError } from '@/api/types';
import type { MeUserVO } from '@/api/generated/models';

/**
 * bootstrap 节流窗口(毫秒)。守卫第一步**每次导航都会调** bootstrap ——
 * 不节流的话每切一次路由就是一次 /me 往返,慢网络下导航被网络串行卡住。
 * 导出给测试:越窗断言直接把 `bootstrappedAt` 拨到窗口外,不用动假时钟。
 */
export const BOOTSTRAP_TTL_MS = 60_000;

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
    /** 最近一次**成功** bootstrap 的时刻 —— 窗口内导航复用结果,不打 /me(见 bootstrap)。 */
    bootstrappedAt: 0,
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
     * 守卫第一步(含公开页):/me 是会话与 csrfToken 的唯一权威来源。
     *
     * **节流**:60s 窗口内复用上次结果,不重复打 /me —— 否则每切一次路由
     * 一次往返,导航被网络串行卡住。会话被别处吊销/登出的滞后由 API 401
     * (`emitAuthCleared` → reset → 下次导航真打)兜底,60s 只是「看到」的延迟。
     *
     * 错误分流是守卫 `reason=unavailable` 的前提,不能全吞:
     * `unauthorized` → 匿名(正常态,置 null,**也是确定答案,同样盖时间节流**);
     * **其他错误(网络断/5xx)原样上抛**,由守卫转 `/login?reason=unavailable`(§2.4),
     * 且**不盖时间** —— 后端恢复后的下一次导航必须真重试。
     */
    async bootstrap() {
      if (this.bootstrappedAt && Date.now() - this.bootstrappedAt < BOOTSTRAP_TTL_MS) {
        return;
      }
      try {
        const me = await fetchUser();
        this.user = me.user ?? null;
        this.bootstrappedAt = Date.now();
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'unauthorized') {
          this.user = null;
          this.bootstrappedAt = Date.now();
        } else {
          throw e; // 失败不盖 bootstrappedAt;finally 仍会置 bootstrapped,错误交给守卫分流
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
    /** 短信验证码登录 —— 会话落点与密码登录完全同种(后端 establishSession 共用)。 */
    async loginWithSms(phone: string, code: string) {
      const me = await smsLogin(phone, code);
      this.user = me.user ?? null;
      this.routesReady = false;
    },
    /** 注册即登录:响应与登录同形,状态处理与 loginAs 完全一致。 */
    async register(phone: string, code: string, password: string) {
      const me = await registerAdapter(phone, code, password);
      this.user = me.user ?? null;
      this.routesReady = false;
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
      this.bootstrappedAt = 0; // 登出/401 清态后,下次导航必须真打 /me,不能吃节流
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
