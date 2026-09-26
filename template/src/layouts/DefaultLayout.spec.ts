import { guardedRoutes } from '@/router/routes';
import { useSystemStore } from '@/stores/system';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router, type RouteRecordRaw } from 'vue-router';
import DefaultLayout from './DefaultLayout.vue';

/**
 * 布局顶栏回归锁:导航**从真实 guardedRoutes 派生**(meta.title + filterRoutesByRoles)——
 * 顶栏组件刻意读模块级路由树(没有 props 注入),所以测试也往真实树上挂节点,
 * 写死菜单或漏掉角色过滤在这里会红。
 */

/** 路由夹具只负责「能渲染」;导航内容来自真实 guardedRoutes。 */
const routes: RouteRecordRaw[] = [
  { path: '/login', component: { template: '<div/>' } },
  {
    path: '/',
    component: { template: '<div><RouterView /></div>' },
    children: [{ path: ':any(.*)*', component: { template: '<div>page</div>' } }],
  },
];

/** 临时挂进真实路由树的 roles 限定节点(每个用例后摘掉,不污染同文件其他用例)。 */
const adminChild = {
  path: 'admin-tools',
  name: 'adminTools',
  component: { template: '<div/>' },
  meta: { title: '管理台', roles: ['admin'] },
};

async function mountLayout(roles: string[]): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes });
  router.push('/');
  await router.isReady();

  const wrapper = mount(DefaultLayout, { global: { plugins: [pinia, router] } });
  // 后渲染:computed 的 navItems 会跟着 store.roles 重算
  useSystemStore(pinia).user = {
    id: '1',
    nickname: 'spike',
    phone: '13800000000',
    roles,
    permissions: [],
  };
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  guardedRoutes[0]!.children!.push(adminChild as never);
});

afterEach(() => {
  const children = guardedRoutes[0]!.children!;
  const idx = children.findIndex((c) => c.name === adminChild.name);
  if (idx >= 0) children.splice(idx, 1);
});

describe('DefaultLayout 顶栏', () => {
  it('导航从路由树派生:有 title 才进、按 roles 过滤、首页靠站名不重复', async () => {
    const { wrapper } = await mountLayout(['user']);

    expect(wrapper.find('a[href="/devices"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/settings"]').exists()).toBe(true);
    // roles=['admin'] 的节点对普通用户不可见 —— 与守卫 ④ 同一份过滤逻辑
    expect(wrapper.text()).not.toContain('管理台');
    // 站名就是首页入口:导航里不该再有第二份(首页子路由不写 title)
    expect(wrapper.find('a[href="/"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('首页');
  });

  it('admin 用户能看到管理台(过滤是双向的)', async () => {
    const { wrapper } = await mountLayout(['admin']);
    expect(wrapper.text()).toContain('管理台');
  });

  it('退出按钮 → store.logout + 跳 /login(从布局层兜住,不再散在页面里)', async () => {
    const { wrapper, router } = await mountLayout(['user']);
    const store = useSystemStore();
    const logout = vi.spyOn(store, 'logout').mockResolvedValue(undefined);

    await wrapper
      .findAll('button')
      .find((b) => b.text() === '退出')!
      .trigger('click');
    await flushPromises();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
