<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <section class="p-6 flex flex-col gap-4 items-start">
    <h1 class="text-lg font-semibold">
      404
    </h1>
    <p class="text-sm text-muted">
      页面不存在。
    </p>
    <button
      class="border border-border rounded px-3 py-2"
      @click="router.push('/')"
    >
      回首页
    </button>
  </section>
</template>
