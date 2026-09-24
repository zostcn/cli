import { useSystemStore } from '@/stores/system';
import { filterRoutesByRoles } from './filter';
import { guardedRoutes } from './routes';
import type { Router } from 'vue-router';
import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router';

/**
 * 守卫四步,**顺序即正确性**(§2.4 第一行,调错就复现那条故障):
 *
 * ① 先补认证上下文(**含公开页**)—— /login 页要靠它拿到 csrfToken;
 *    提前 return 的话首次 `POST /login` 恒 403,**永远登不进去**。
 * ② `meta.public` → 放行。
 * ③ 未登录 → 跳登录。
 * ④ 路由未就绪 → 按角色过滤、注入、标记就绪、**replace 重进**。
 *
 * ④ 放守卫**而不是登录回调**:放回调的话,刷新后 routesReady 丢失、
 * 而回调不会再跑,动态路由就再也回不来(§2.4「路由重建位置」)。
 */
export function createAuthGuard(router: Router) {
  return async function guard(
    to: RouteLocationNormalized,
    _from: RouteLocationNormalized,
    next: NavigationGuardNext,
  ): Promise<void> {
    const store = useSystemStore(); // 导航发生在 mount 后,pinia 已激活

    // ① 含公开页。bootstrap 只对 unauthorized 收敛成匿名,其他错误上抛到这
    try {
      await store.bootstrap();
    } catch {
      // 后端不可达:跳登录并标记原因(§2.4)。已经在 /login 且带了标记 → 停住,别重定向循环。
      if (to.path === '/login' && to.query.reason === 'unavailable') {
        next();
      } else {
        next({ path: '/login', query: { ...to.query, reason: 'unavailable' }, replace: true });
      }
      return;
    }

    // ② 公开页
    if (to.meta.public) {
      next();
      return;
    }

    // ③ 未登录
    if (!store.isAuthenticated) {
      next({ path: '/login', query: { ...to.query }, replace: true });
      return;
    }

    // ④ 动态路由注入
    if (!store.routesReady) {
      const injectable = filterRoutesByRoles(guardedRoutes, store.roles);
      for (const route of injectable) {
        router.addRoute(route);
      }
      store.markRoutesReady();
      // ⚠️ 用 path 重进,**不能** `{...to}`:to.name 是注入前解析出来的
      // (比如落到 catch-all 的 'not-found'),展开它会按旧 name 走,新路由白注入。
      next({ path: to.fullPath, replace: true });
      return;
    }

    next();
  };
}
