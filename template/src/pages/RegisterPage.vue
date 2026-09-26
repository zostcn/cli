<script setup lang="ts">
  import { sendSmsCode } from "@/api/auth";
  import { messageOf } from "@/api/messageOf";
  import { useSystemStore } from "@/stores/system";
  import { onBeforeUnmount, ref } from "vue";
  import { useRouter } from "vue-router";

  /**
   * 注册页(机制层)。流程与后端一一对应:
   * ① 发码带 `purpose: 'register'`(一律发,含已注册号码 —— 已注册用户拿码提交后
   *    才能看到「该手机号已注册,去登录」的引导;响应恒 200,不泄漏账号存在性);
   * ② 提交走 store.register —— **即注册即登录**,成功只 `replace('/')`,
   *    动态路由注入与登录一样在守卫 ④,不在这里。
   */
  const store = useSystemStore();
  const router = useRouter();

  const phone = ref("");
  const code = ref("");
  const password = ref("");
  const error = ref("");
  /** 发码倒计时(秒)。与后端生产限流同档:发码 1 次/分钟/IP(注册档 3/min/IP)。 */
  const cooldown = ref(0);
  let cooldownTimer: number | undefined;

  async function onSendCode() {
    error.value = "";
    if (!phone.value) {
      error.value = "请输入手机号";
      return;
    }
    try {
      await sendSmsCode(phone.value, "register");
      cooldown.value = 60;
      cooldownTimer = window.setInterval(() => {
        cooldown.value -= 1;
        if (cooldown.value <= 0) window.clearInterval(cooldownTimer);
      }, 1000);
    } catch (e) {
      error.value = messageOf(e, "发送失败，请稍后再试");
    }
  }

  async function onSubmit() {
    error.value = "";
    try {
      await store.register(phone.value, code.value, password.value);
      await router.replace("/");
    } catch (e) {
      // 「该手机号已注册」「验证码错误」「密码至少 8 位」都是后端 detail,原样透出
      error.value = messageOf(e, "注册失败，请稍后再试");
    }
  }

  onBeforeUnmount(() => window.clearInterval(cooldownTimer));
</script>

<template>
  <main class="min-h-screen bg-bg text-fg flex items-center justify-center">
    <form class="w-80 flex flex-col gap-3" @submit.prevent="onSubmit">
      <h1 class="text-lg font-semibold">注册</h1>

      <input
        v-model="phone"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="手机号"
        autocomplete="username"
        required
      />

      <input
        v-model="password"
        type="password"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="密码（至少 8 位）"
        autocomplete="new-password"
        required
      />

      <div class="flex gap-2">
        <input
          v-model="code"
          class="border border-border rounded px-3 py-2 bg-bg text-fg flex-1"
          placeholder="验证码"
          autocomplete="one-time-code"
          required
        />
        <button
          type="button"
          class="border border-border rounded px-3 py-2 text-sm disabled:opacity-50"
          :disabled="cooldown > 0"
          @click="onSendCode"
        >
          {{ cooldown > 0 ? `${cooldown}s 后重发` : "发送验证码" }}
        </button>
      </div>

      <!-- 发码响应恒为 200(防枚举) —— 「发没发」只能靠手机收没收到,别拿响应判断 -->
      <p class="text-xs text-muted">验证码 5 分钟内有效；注册成功即自动登录</p>

      <button type="submit" class="bg-primary text-white rounded px-3 py-2">
        注册并登录
      </button>
      <p v-if="error" class="text-sm text-danger">
        {{ error }}
      </p>
      <p class="text-sm text-muted">
        已有账号？
        <RouterLink to="/login" class="text-primary"> 去登录 </RouterLink>
      </p>
    </form>
  </main>
</template>
