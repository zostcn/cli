<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/types';
import { useSystemStore } from '@/stores/system';
import { ref } from 'vue';

/**
 * 登录页是**机制载体**(§2.2「无示例页面」指不做视觉设计):
 * csrfToken 由守卫 ① bootstrap 拿到、拦截器注入头,这里只管表单与错误分流。
 * 登录成功后只 `replace('/')` —— 动态路由的注入在守卫 ④,不在这里。
 */
const store = useSystemStore();
const route = useRoute();
const router = useRouter();

const phone = ref('');
const password = ref('');
const error = ref('');

const reason = typeof route.query.reason === 'string' ? route.query.reason : '';
const reasonText =
  reason === 'expired' ? '登录已过期，请重新登录' : reason === 'unavailable' ? '服务暂不可用' : '';

function messageOf(e: unknown): string {
  if (!(e instanceof ApiError)) return '登录失败，请稍后再试';
  switch (e.kind) {
    case 'rate_limited':
      return '请求过于频繁，请稍后再试';
    case 'csrf':
      return '会话校验失败，请刷新页面重试';
    case 'client':
      return e.message || '手机号或密码错误';
    default:
      return '服务暂不可用，请稍后再试';
  }
}

async function onSubmit() {
  error.value = '';
  try {
    await store.loginAs(phone.value, password.value);
    await router.replace('/');
  } catch (e) {
    error.value = messageOf(e);
  }
}
</script>

<template>
  <main class="min-h-screen bg-bg text-fg flex items-center justify-center">
    <form
      class="w-80 flex flex-col gap-3"
      @submit.prevent="onSubmit"
    >
      <h1 class="text-lg font-semibold">
        登录
      </h1>
      <p
        v-if="reasonText"
        class="text-sm text-muted"
      >
        {{ reasonText }}
      </p>
      <input
        v-model="phone"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="手机号"
        autocomplete="username"
        required
      >
      <input
        v-model="password"
        type="password"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="密码"
        autocomplete="current-password"
        required
      >
      <button
        type="submit"
        class="bg-primary text-white rounded px-3 py-2"
      >
        登录
      </button>
      <p
        v-if="error"
        class="text-sm text-danger"
      >
        {{ error }}
      </p>
    </form>
  </main>
</template>
