import type { RouteRecordRaw } from 'vue-router';

/**
 * 按角色过滤路由树(纯函数,不改输入)。
 *
 * 规则:
 * - `meta.roles` 缺省 = 「登录即可」,保留;
 * - 父级的 `meta.roles` **向下继承** —— vue-router 的 `to.meta` 是沿 matched
 *   链合并的,过滤发生在**注入前**,所以这里必须自己把父角色传下去,
 *   否则「写在父级、整组受约束」只在运行时 meta 合并里成立、注入时却是漏的;
 * - 生效 roles 与用户 roles **无交集** → 剔除该节点(父被剔,子随之消失);
 * - 用户 roles 为空数组 → 一切需要角色的分支都被剔除。
 *
 * 这是权限三层(B7)的第二层;第三层守卫兜底,第一层是类型/常量。
 */
export function filterRoutesByRoles(
  routes: RouteRecordRaw[],
  userRoles: string[],
  parentRoles?: readonly string[],
): RouteRecordRaw[] {
  const result: RouteRecordRaw[] = [];
  for (const route of routes) {
    const own = Array.isArray(route.meta?.roles) ? route.meta.roles : undefined;
    const effective = own ?? parentRoles;
    if (effective && !effective.some((role) => userRoles.includes(role))) {
      continue;
    }
    const filtered: RouteRecordRaw = { ...route };
    if (route.children) {
      filtered.children = filterRoutesByRoles(route.children, userRoles, effective);
    }
    result.push(filtered);
  }
  return result;
}
