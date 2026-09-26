<script setup lang="ts">
  import { changePassword, sendSmsCode } from "@/api/auth";
  import { messageOf } from "@/api/messageOf";
  import { useSystemStore } from "@/stores/system";
  import { computed, onBeforeUnmount, ref } from "vue";

  /**
   * 账号安全页(机制层):改密码 + 信任设备入口。
   *
   * 改密凭据**二选一**(与后端 `ChangePasswordRequest` 一一对应):
   * 「知道当前密码」走旧密码;「不记得」走**新鲜短信验证码** ——
   * 短信登录进来的用户没有旧密码可填,闭环靠这条。发码用缺省 `login` purpose
   * (本人已注册,该 purpose 就是给已注册号码发的)。
   *
   * 成功后其他会话被服务端作废、当前保留 —— 所以本页成功后不清 store,
   * 只提示「其他设备已退出」。
   */
  const store = useSystemStore();

  const mode = ref<"old" | "code">("old");
  const oldPassword = ref("");
  const code = ref("");
  const newPassword = ref("");
  const confirmPassword = ref("");
  const error = ref("");
  const success = ref("");
  /** 发码倒计时(秒)。与后端生产限流同档:发码 1 次/分钟/IP。 */
  const cooldown = ref(0);
  let cooldownTimer: number | undefined;

  /** 发码目标展示用:/me 现在带回本人手机号(只给账号主人看)。 */
  const maskedPhone = computed(() => {
    const phone = store.user?.phone ?? "";
    return phone.length >= 11
      ? phone.slice(0, 3) + "****" + phone.slice(7)
      : phone;
  });

  function switchMode(next: "old" | "code") {
    mode.value = next;
    error.value = "";
    success.value = "";
  }

  async function onSendCode() {
    error.value = "";
    success.value = "";
    const phone = store.user?.phone;
    if (!phone) {
      error.value = "账号信息缺失，请刷新页面重试";
      return;
    }
    try {
      await sendSmsCode(phone, "login");
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
    success.value = "";
    if (newPassword.value !== confirmPassword.value) {
      error.value = "两次输入的新密码不一致";
      return;
    }
    if (newPassword.value.length < 8) {
      error.value = "密码至少 8 位";
      return;
    }
    if (mode.value === "old" && !oldPassword.value) {
      error.value = "请输入当前密码";
      return;
    }
    if (mode.value === "code" && !code.value) {
      error.value = "请输入验证码";
      return;
    }
    try {
      await changePassword(
        mode.value === "old"
          ? { oldPassword: oldPassword.value, newPassword: newPassword.value }
          : { code: code.value, newPassword: newPassword.value },
      );
      success.value = "密码已更新；其他设备上的登录已退出";
      oldPassword.value = "";
      code.value = "";
      newPassword.value = "";
      confirmPassword.value = "";
    } catch (e) {
      // 「旧密码错误」「验证码错误或已过期」都是后端 detail,原样透出
      error.value = messageOf(e, "修改失败，请稍后再试");
    }
  }

  onBeforeUnmount(() => window.clearInterval(cooldownTimer));
</script>

<template>
  <section class="w-80 flex flex-col gap-4 p-4">
    <h1 class="text-lg font-semibold">账号安全</h1>

    <form class="flex flex-col gap-3" @submit.prevent="onSubmit">
      <div class="flex items-center gap-3 text-sm">
        <span class="text-muted">验证方式</span>
        <button
          type="button"
          :class="mode === 'old' ? 'text-primary font-medium' : 'text-muted'"
          @click="switchMode('old')"
        >
          当前密码
        </button>
        <button
          type="button"
          :class="mode === 'code' ? 'text-primary font-medium' : 'text-muted'"
          @click="switchMode('code')"
        >
          短信验证码
        </button>
      </div>

      <!-- ── 知道当前密码 ─────────────────────── -->
      <input
        v-if="mode === 'old'"
        v-model="oldPassword"
        type="password"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="当前密码"
        autocomplete="current-password"
      />

      <!-- ── 不记得,短信验证 ─────────────────── -->
      <template v-else>
        <p class="text-xs text-muted">
          验证码将发送至账号绑定手机 {{ maskedPhone }}
        </p>
        <div class="flex gap-2">
          <input
            v-model="code"
            class="border border-border rounded px-3 py-2 bg-bg text-fg flex-1"
            placeholder="验证码"
            autocomplete="one-time-code"
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
      </template>

      <input
        v-model="newPassword"
        type="password"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="新密码（至少 8 位）"
        autocomplete="new-password"
        required
      />
      <input
        v-model="confirmPassword"
        type="password"
        class="border border-border rounded px-3 py-2 bg-bg text-fg"
        placeholder="确认新密码"
        autocomplete="new-password"
        required
      />
      <p class="text-xs text-muted">
        修改成功后，其他设备上的登录会立即退出，本设备保持登录
      </p>
      <button type="submit" class="bg-primary text-white rounded px-3 py-2">
        保存
      </button>
      <p v-if="error" class="text-sm text-danger">
        {{ error }}
      </p>
      <p v-if="success" class="text-sm text-primary">
        {{ success }}
      </p>
    </form>
  </section>
</template>
