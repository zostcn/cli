import { describe, expect, it } from 'vitest';
import type { RouteRecordRaw } from 'vue-router';
import { filterRoutesByRoles } from './filter';

// filter 只看 meta,组件本身无所谓
const dummy = { template: '<div />' } as never;

function fixture(): RouteRecordRaw[] {
  return [
    {
      path: '/admin',
      component: dummy,
      meta: { roles: ['admin'] },
      children: [{ path: 'users', component: dummy }],
    },
    {
      path: '/open',
      component: dummy,
      children: [{ path: 'nested', component: dummy }],
    },
    {
      path: '/both',
      component: dummy,
      meta: { roles: ['admin', 'editor'] },
      children: [{ path: 'child', component: dummy, meta: { roles: ['editor'] } }],
    },
  ];
}

describe('filterRoutesByRoles', () => {
  it('父 meta.roles 整组约束 —— 子路由不单独幸存', () => {
    const result = filterRoutesByRoles(fixture(), ['user']);
    expect(result.map((r) => r.path)).toEqual(['/open']);
  });

  it('角色命中则保留整组', () => {
    const result = filterRoutesByRoles(fixture(), ['admin']);
    expect(result.map((r) => r.path)).toContain('/admin');
    expect(result.find((r) => r.path === '/admin')?.children).toHaveLength(1);
  });

  it('缺省 roles = 登录即可,始终保留', () => {
    const result = filterRoutesByRoles(fixture(), ['nobody']);
    expect(result.map((r) => r.path)).toContain('/open');
  });

  it('子路由可比父更严:父放行时子仍按自己的 roles 判', () => {
    const result = filterRoutesByRoles(fixture(), ['admin']);
    const both = result.find((r) => r.path === '/both');
    expect(both).toBeDefined(); // admin 命中父
    expect(both?.children).toEqual([]); // 子要 editor,admin 没有 → 空
  });

  it('用户没有任何角色 → 所有需要角色的分支被剔除', () => {
    const result = filterRoutesByRoles(fixture(), []);
    expect(result.map((r) => r.path)).toEqual(['/open']);
  });

  it('纯函数:输入树不被修改', () => {
    const input = fixture();
    const snapshot = JSON.stringify(input);
    filterRoutesByRoles(input, ['admin']);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
