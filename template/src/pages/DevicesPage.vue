<script setup lang="ts">
  import { useDeleteAuthDeviceId, useGetAuthDevice } from "@/api/generated";
  import { ApiError } from "@/api/types";
  import { useSystemStore } from "@/stores/system";
  import { ref } from "vue";
  import { useRouter } from "vue-router";

  /**
   * 信任设备管理（§1.12）：列表 + 吊销。
   *
   * 吊销 = **踢下线**（后端 DeviceRevocationFilter 下个请求作废该设备的会话）——
   * 吊销「当前设备」会把自己登出，所以确认文案必须点明，确认后主动走 logout 收尾。
   */
  const store = useSystemStore();
  const router = useRouter();
  const {
    data: devices,
    isLoading,
    error: loadError,
    refetch,
  } = useGetAuthDevice();
  const revokeMutation = useDeleteAuthDeviceId();
  const message = ref("");

  function fmt(iso?: string): string {
    return iso ? new Date(iso).toLocaleString() : "—";
  }

  async function onRevoke(id: string | undefined, current?: boolean) {
    if (!id) return;
    const tip = current
      ? "这是当前设备，吊销后你会立即被登出。确定吊销？"
      : "确定吊销该设备？它上面的会话会被立即登出。";
    if (!window.confirm(tip)) return;

    message.value = "";
    try {
      await revokeMutation.mutateAsync({ id });
      if (current) {
        // 吊销自己 = 下个请求就会被过滤器登出 —— 主动收尾比等 401 优雅
        await store.logout();
        await router.replace("/login");
        return;
      }
      await refetch();
      message.value = "已吊销";
    } catch (e) {
      message.value =
        e instanceof ApiError && e.message ? e.message : "吊销失败，请稍后再试";
    }
  }
</script>

<template>
  <section class="p-6 flex flex-col gap-4">
    <h1 class="text-lg font-semibold">信任设备</h1>
    <p class="text-sm text-muted">
      新设备用密码登录时会要求短信验证；在这里吊销设备会立即将其登出。
    </p>

    <p v-if="isLoading" class="text-sm text-muted">加载中…</p>
    <p v-else-if="loadError" class="text-sm text-danger">
      {{
        loadError instanceof ApiError && loadError.message
          ? loadError.message
          : "加载失败"
      }}
    </p>
    <p v-else-if="!devices?.length" class="text-sm text-muted">
      还没有登记的设备
    </p>

    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="device in devices"
        :key="device.id"
        class="border border-border rounded px-3 py-2 flex flex-col gap-1"
      >
        <div class="flex items-center gap-2">
          <span class="font-medium break-all">{{
            device.label || "未知设备"
          }}</span>
          <span
            v-if="device.current"
            class="text-xs border border-border rounded px-1"
            >当前设备</span
          >
          <span v-if="device.revoked" class="text-xs text-danger">已吊销</span>
        </div>
        <div class="text-xs text-muted flex flex-wrap gap-x-4">
          <span>首次：{{ fmt(device.firstSeenAt) }}</span>
          <span>最近：{{ fmt(device.lastSeenAt) }}</span>
          <span>信任至：{{ fmt(device.expiresAt) }}</span>
        </div>
        <button
          v-if="!device.revoked"
          class="self-start text-sm border border-border rounded px-2 py-1"
          :disabled="revokeMutation.isPending.value"
          @click="onRevoke(device.id, device.current)"
        >
          吊销
        </button>
      </li>
    </ul>

    <p v-if="message" class="text-sm">
      {{ message }}
    </p>
  </section>
</template>
