<script setup lang="ts">
/**
 * 空壳布局 —— 模板**不决定长相**(§2.2):侧栏、顶栏、颜色都是项目的事。
 * 这里只有一个插槽位置,项目往里放自己的布局。
 */
</script>

<template>
  <div class="min-h-screen bg-bg text-fg">
    <RouterView />
  </div>
</template>
