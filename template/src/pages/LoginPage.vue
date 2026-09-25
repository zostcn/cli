<script setup lang="ts">
import { sendSmsCode } from '@/api/auth';
import { ApiError } from '@/api/types';
import { useSystemStore } from '@/stores/system';
import { onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * 登录页是**机制载体**(§2.2「无示例页面」指不做视觉设计):
 * csrfToken 由守卫 ① bootstrap 拿到、拦截器注入头,这里只管表单与错误分流。
 * 登录成功后只 `replace('/')` —— 动态路由的注入在守卫 ④,不在这里。
 *
 * 两条通道:密码 / 短信验证码。会话形状完全一致(后端 establishSession 共用),
 * 切换只影响表单与调用的 action。
 */
const store = useSystemStore();
const route = useRoute();
const router = useRouter();

const mode = ref<'password' | 'sms'>('password');
const phone = ref('');
const password = ref('');
const code = ref('');
const error = ref('');
/** 发码倒计时(秒)。与后端生产限流同档:发码 1 次/分钟/IP。 */
const cooldown = ref(0);
let cooldownTimer: number | undefined;

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

function switchMode(next: 'password' | 'sms') {
  mode.value = next;
  error.value = '';
}

async function onSendCode() {
  error.value = '';
  if (!phone.value) {
    error.value = '请输入手机号';
    return;
  }
  try {
    await sendSmsCode(phone.value);
    cooldown.value = 60;
    cooldownTimer = window.setInterval(() => {
      cooldown.value -= 1;
      if (cooldown.value <= 0) window.clearInterval(cooldownTimer);
    }, 1000);
  } catch (e) {
    error.value = messageOf(e);
  }
}

async function onSubmit() {
  error.value = '';
  try {
    if (mode.value === 'sms') {
      if (!code.value) {
        error.value = '请输入验证码';
        return;
      }
      await store.loginWithSms(phone.value, code.value);
    } else {
      await store.loginAs(phone.value, password.value);
    }
    await router.replace('/');
  } catch (e) {
    error.value = messageOf(e);
  }
}

onBeforeUnmount(() => window.clearInterval(cooldownTimer));
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

      <div class="flex gap-4 text-sm">
        <button
          type="button"
          :class="mode === 'password' ? 'text-primary font-medium' : 'text-muted'"
          @click="switchMode('password')"
        >
          密码登录
        </button>
        <button
          type="button"
          :class="mode === 'sms' ? 'text-primary font-medium' : 'text-muted'"
          @click="switchMode('sms')"
        >
          验证码登录
        </button>
      </div>

      <input
        v-model="phone"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="手机号"
        autocomplete="username"
        required
      >
      <input
        v-if="mode === 'password'"
        v-model="password"
        type="password"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="密码"
        autocomplete="current-password"
        required
      >
      <template v-else>
        <div class="flex gap-2">
          <input
            v-model="code"
            class="border border-border rounded px-3 py-2 bg-bg text-fg flex-1"
            placeholder="验证码"
            autocomplete="one-time-code"
            required
          >
          <button
            type="button"
            class="border border-border rounded px-3 py-2 text-sm disabled:opacity-50"
            :disabled="cooldown > 0"
            @click="onSendCode"
          >
            {{ cooldown > 0 ? `${cooldown}s 后重发` : '发送验证码' }}
          </button>
        </div>
        <!-- 发码响应恒为 200(后端防枚举) —— 没收到短信不等于发送失败,重发前先检查手机号 -->
        <p class="text-xs text-muted">
          验证码 5 分钟内有效；未收到请检查手机号后重新发送
        </p>
      </template>

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
