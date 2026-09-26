<script setup lang="ts">
import { filterRoutesByRoles } from '@/router/filter';
import { guardedRoutes } from '@/router/routes';
import { useSystemStore } from '@/stores/system';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * 带顶栏的布局壳 —— 机制只有三样,样式只是 token 里的几个类,不决定长相(§2.2):
 *
 * ① **站名** → 回首页(首页不写 `meta.title`,不在导航里重复出现);
 * ② **导航从路由树派生**(B6 的兑现):子路由写 `meta.title` 才进导航,
 *    roles 用与守卫 ④ **同一份** `filterRoutesByRoles` 过滤 ——
 *    权限与菜单只维护 route meta 一处,没有第二份菜单配置;
 * ③ **退出** —— 原来散在 HomePage,收进布局后每页都有。
 *
 * 子页面的「返回」由此覆盖:顶栏常驻,站名回首页、导航互跳、退出在右。
 * 项目要换长相(侧栏/主题)就把本文件整个换掉,导航派生逻辑照抄。
 */
const store = useSystemStore();
const route = useRoute();
const router = useRouter();

const navItems = computed(() => {
  const [root] = filterRoutesByRoles(guardedRoutes, store.roles);
  return (root?.children ?? [])
    .filter((child) => typeof child.meta?.title === 'string')
    .map((child) => ({
      // 子路由写相对路径(devices)或绝对路径(/devices)都归一成绝对
      to: '/' + String(child.path).replace(/^\/+/, ''),
      title: child.meta?.title as string,
    }));
});

async function onLogout() {
  await store.logout();
  await router.replace('/login');
}
</script>

<template>
  <div class="min-h-screen bg-bg text-fg">
    <header class="border-b border-border px-4 py-2 flex items-center gap-4 text-sm">
      <RouterLink
        to="/"
        class="font-semibold"
      >
        zost
      </RouterLink>
      <nav class="flex items-center gap-3">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="route.path === item.to ? 'text-primary font-medium' : 'text-muted'"
        >
          {{ item.title }}
        </RouterLink>
      </nav>
      <button
        type="button"
        class="ml-auto border border-border rounded px-2 py-1"
        @click="onLogout"
      >
        退出
      </button>
    </header>
    <RouterView />
  </div>
</template>
