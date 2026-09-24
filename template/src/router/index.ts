import { createRouter, createWebHistory } from 'vue-router';
import { publicRoutes } from './routes';

/**
 * 初始只挂公开路由;守卫树由 `guard.ts` 第 ④ 步按角色注入。
 * history 的 base 跟 vite 的 `base` 走 —— 部署在子路径时两处必须一致,
 * 否则「本地能跑、部署后白屏」(脚手架会把两项一起参数化,见 §2.6)。
 */
export function createAppRouter() {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: publicRoutes,
  });
}
