import { createRouter, createWebHistory } from "vue-router";
import HomePage from "@/pages/HomePage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import type { RouteRecordRaw } from "vue-router";

/**
 * 静态路由:首页 + catch-all 404(手写,不引 unplugin-vue-router)。
 * history 的 base 跟 vite 的 `base` 走 —— 部署在子路径时两处必须一致,
 * 否则「本地能跑、部署后白屏」(脚手架会把两项一起参数化)。
 */
const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: HomePage },
  { path: "/:pathMatch(.*)*", name: "not-found", component: NotFoundPage },
];

export function createAppRouter() {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
  });
}
