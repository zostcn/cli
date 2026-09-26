<script setup lang="ts">
import { useSystemStore } from '@/stores/system';

/**
 * 登录后的落点 —— 证明「守卫放行 + 会话在」两件事,不含业务。
 * 导航/退出已收进 DefaultLayout 顶栏(从路由树派生),这里不再重复给入口。
 */
const store = useSystemStore();
</script>

<template>
  <section class="p-6 flex flex-col gap-4">
    <h1 class="text-lg font-semibold">
      你好，{{ store.user?.nickname }}
    </h1>
    <p class="text-sm text-muted">
      roles: {{ store.roles.join(', ') || '—' }}
    </p>
  </section>
</template>
