import { ApiError } from '@/api/types';
import * as authAdapter from '@/api/auth';
import { useSystemStore } from '@/stores/system';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createAuthGuard } from './guard';
import { publicRoutes } from './routes';

vi.mock('@/api/auth', () => ({
  fetchUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const fetchUser = vi.mocked(authAdapter.fetchUser);

// 生成的 MeResponse.user 是可选字段(OpenAPI 没标 null);后端实际会发 null,
// store 里 `me.user ?? null` 两种都收敛 —— fixture 省略字段即可对齐类型。
const anonymous = { csrfToken: 't' };
const admin = {
  user: { id: '1', nickname: 'root', roles: ['admin'], permissions: [] },
  csrfToken: 't',
};

function makeRouter(): Router {
  const router = createRouter({ history: createMemoryHistory(), routes: publicRoutes });
  router.beforeEach(createAuthGuard(router));
  return router;
}

beforeEach(() => {
  setActivePinia(createPinia());
  fetchUser.mockReset();
});

describe('守卫四步(§2.4 顺序即正确性)', () => {
  it('① 公开页也先 bootstrap —— 提前返回的话 /login 拿不到 csrfToken,POST 恒 403', async () => {
    fetchUser.mockResolvedValue(anonymous);
    const router = makeRouter();

    await router.push('/login');

    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('③ 已有动态路由但会话已失效 → 跳 /login', async () => {
    fetchUser.mockResolvedValue(admin);
    const router = makeRouter();
    await router.push('/'); // ④ 注入了守卫树,落在 home
    expect(router.currentRoute.value.name).toBe('home');

    fetchUser.mockResolvedValue(anonymous); // 会话过期
    // 带 query:当前就停在 '/',push 相同 fullPath 是 duplicate,guard 不会跑
    await router.push('/?probe=expired');

    expect(router.currentRoute.value.path).toBe('/login');
  });

  it('④ 登录态首次进入 → 按角色注入守卫树并 replace 重进,落在 home', async () => {
    fetchUser.mockResolvedValue(admin);
    const router = makeRouter();

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('home');
    expect(useSystemStore().routesReady).toBe(true);
    // 首次进入 + 重进各 bootstrap 一次
    expect(fetchUser).toHaveBeenCalledTimes(2);
  });

  it('④ 重建只在守卫里 —— store 的 routesReady 是唯一开关', async () => {
    fetchUser.mockResolvedValue(admin);
    const router = makeRouter();
    await router.push('/');
    expect(useSystemStore().routesReady).toBe(true);

    useSystemStore().routesReady = false; // 模拟登录后 loginAs 清标记
    await router.push('/login'); // 先跳走 —— push 当前路由是 duplicate,guard 不会跑
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('home');
    expect(useSystemStore().routesReady).toBe(true);
  });

  it('bootstrap 抛 unavailable(网络断/5xx)→ /login?reason=unavailable,不冒泡', async () => {
    fetchUser.mockRejectedValue(new ApiError(503, 'unavailable', 'down'));
    const router = makeRouter();

    await expect(router.push('/anything')).resolves.not.toThrow();

    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.reason).toBe('unavailable');
  });

  it('已经在 /login 且带 reason=unavailable → 停住,不重定向循环', async () => {
    fetchUser.mockRejectedValue(new ApiError(503, 'unavailable', 'down'));
    const router = makeRouter();

    await router.push('/x');
    expect(router.currentRoute.value.query.reason).toBe('unavailable');

    await expect(router.push('/login')).resolves.not.toThrow();
    expect(router.currentRoute.value.query.reason).toBe('unavailable');
    expect(fetchUser.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
