<script setup lang="ts">
  import { sendSmsCode } from "@/api/auth";
  import { messageOf } from "@/api/messageOf";
  import { ApiError } from "@/api/types";
  import { useSystemStore } from "@/stores/system";
  import { computed, onBeforeUnmount, ref } from "vue";
  import { useRoute, useRouter } from "vue-router";

  /**
   * 登录页是**机制载体**(§2.2「无示例页面」指不做视觉设计):
   * csrfToken 由守卫 ① bootstrap 拿到、拦截器注入头,这里只管表单与错误分流。
   * 登录成功后只 `replace('/')` —— 动态路由的注入在守卫 ④,不在这里。
   *
   * 三个视图:密码 / 验证码 是并列入口(「登录方式」切换);`stepUp` 是**新设备步进**(§1.12)
   * —— 密码验对但设备不可信(后端 409)时进入的专用提示页:说明原因、展示掩码手机号,
   * 用户**手动**点发送、填码完成验证。会话形状三条路完全一致(后端 establishSession 共用)。
   */
  const store = useSystemStore();
  const route = useRoute();
  const router = useRouter();

  const mode = ref<"password" | "sms" | "stepUp">("password");
  const phone = ref("");
  const password = ref("");
  const code = ref("");
  const error = ref("");
  /** 发码倒计时(秒)。与后端生产限流同档:发码 1 次/分钟/IP。 */
  const cooldown = ref(0);
  let cooldownTimer: number | undefined;

  const reason =
    typeof route.query.reason === "string" ? route.query.reason : "";
  const reasonText =
    reason === "expired"
      ? "登录已过期，请重新登录"
      : reason === "unavailable"
        ? "服务暂不可用"
        : "";

  /** 步进页展示用:手机号已通过密码校验(必然存在),掩码后展示、不可编辑。 */
  const maskedPhone = computed(() =>
    phone.value.length >= 11
      ? phone.value.slice(0, 3) + "****" + phone.value.slice(7)
      : phone.value,
  );

  /** 共用文案 + 登录场景兜底(401/400 的后端 detail 优先,兜底只在 detail 缺席时出现)。 */
  function loginMessage(e: unknown): string {
    return messageOf(e, "手机号或密码错误");
  }

  function switchMode(next: "password" | "sms") {
    mode.value = next;
    error.value = "";
  }

  async function onSendCode() {
    error.value = "";
    if (!phone.value) {
      error.value = "请输入手机号";
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
      error.value = loginMessage(e);
    }
  }

  async function onSubmit() {
    error.value = "";
    try {
      if (mode.value === "password") {
        await store.loginAs(phone.value, password.value);
      } else {
        // 'sms' 与 'stepUp' 都以短信验证码完成 —— 后者只是入口不同(409 步进)
        if (!code.value) {
          error.value = "请输入验证码";
          return;
        }
        await store.loginWithSms(phone.value, code.value);
      }
      await router.replace("/");
    } catch (e) {
      // 新设备步进(§1.12):密码验对了但设备不可信 → 后端 409 + code。
      // **必须在 messageOf 之前拦** —— 它的 client 分支会把 409 显示成「手机号或密码错误」。
      // 401 绝不会出现(那会触发 emitAuthCleared 登出),所以只判 409 双条件。
      // 切到专用提示页,**不自动发码** —— 发送由用户在步进页主动点击。
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        e.code === "DEVICE_VERIFICATION_REQUIRED"
      ) {
        mode.value = "stepUp";
        error.value = "";
        return;
      }
      error.value = loginMessage(e);
    }
  }

  onBeforeUnmount(() => window.clearInterval(cooldownTimer));
</script>

<template>
  <main class="min-h-screen bg-bg text-fg flex items-center justify-center">
    <form class="w-80 flex flex-col gap-3" @submit.prevent="onSubmit">
      <h1 class="text-lg font-semibold">登录</h1>
      <p v-if="reasonText" class="text-sm text-muted">
        {{ reasonText }}
      </p>

      <!-- 登录方式:两个并列入口。stepUp 归在「验证码」一侧高亮(它就是验证码通道的专用入口) -->
      <div class="flex items-center gap-3 text-sm">
        <span class="text-muted">登录方式</span>
        <button
          type="button"
          :class="
            mode === 'password' ? 'text-primary font-medium' : 'text-muted'
          "
          @click="switchMode('password')"
        >
          密码登录
        </button>
        <button
          type="button"
          :class="
            mode !== 'password' ? 'text-primary font-medium' : 'text-muted'
          "
          @click="switchMode('sms')"
        >
          验证码登录
        </button>
      </div>

      <!-- ── 密码登录 ─────────────────────────────── -->
      <template v-if="mode === 'password'">
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
          placeholder="密码"
          autocomplete="current-password"
          required
        />
      </template>

      <!-- ── 新设备步进(409 专用视图) ─────────────── -->
      <template v-else-if="mode === 'stepUp'">
        <div class="border border-border rounded px-3 py-2 flex flex-col gap-1">
          <p class="text-sm">本次在新设备上登录，需要验证手机号</p>
          <p class="font-medium">
            {{ maskedPhone }}
          </p>
        </div>
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
        <p v-if="cooldown > 0" class="text-xs text-muted">
          验证码已发送，5 分钟内有效
        </p>
        <p class="text-xs text-muted">
          完成验证后即在本设备建立登录态；返回请点上方「密码登录」
        </p>
      </template>

      <!-- ── 验证码登录(常规入口) ─────────────────── -->
      <template v-else>
        <input
          v-model="phone"
          class="border border-border rounded px-3 py-2 bg-bg text-fg"
          placeholder="手机号"
          autocomplete="username"
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
        <!-- 发码响应恒为 200(后端防枚举) —— 没收到短信不等于发送失败,重发前先检查手机号 -->
        <p class="text-xs text-muted">
          验证码 5 分钟内有效；未收到请检查手机号后重新发送
        </p>
      </template>

      <button type="submit" class="bg-primary text-white rounded px-3 py-2">
        {{ mode === "stepUp" ? "验证并登录" : "登录" }}
      </button>
      <p v-if="error" class="text-sm text-danger">
        {{ error }}
      </p>
      <!-- 步进视图里藏起注册入口:那时用户已有账号,这个链接只会添乱 -->
      <p v-if="mode !== 'stepUp'" class="text-sm text-muted">
        还没有账号？
        <RouterLink to="/register" class="text-primary"> 注册 </RouterLink>
      </p>
    </form>
  </main>
</template>
