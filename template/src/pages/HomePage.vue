<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useSystemStore } from '@/stores/system';

/** 登录后的落点 —— 证明「守卫放行 + 会话在」两件事,不含业务。 */
const store = useSystemStore();
const router = useRouter();

async function onLogout() {
  await store.logout();
  await router.replace('/login');
}
</script>

<template>
  <section class="p-6 flex flex-col gap-4">
    <h1 class="text-lg font-semibold">
      你好，{{ store.user?.nickname }}
    </h1>
    <p class="text-sm text-muted">
      roles: {{ store.roles.join(', ') || '—' }}
    </p>
    <button
      class="self-start border border-border rounded px-3 py-2"
      @click="onLogout"
    >
      退出登录
    </button>
  </section>
</template>
