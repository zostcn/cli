import { sendSmsCode } from "@/api/auth";
import { ApiError } from "@/api/types";
import { useSystemStore } from "@/stores/system";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import RegisterPage from "./RegisterPage.vue";

/** RegisterPage 回归锁:发码必须带 purpose=register、提交走 store.register 即注册即登录。 */

vi.mock("@/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/auth")>()),
  sendSmsCode: vi.fn(),
}));

let wrapper: VueWrapper;
let router: Router;

async function mountRegister(): Promise<ReturnType<typeof useSystemStore>> {
  const pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      { path: "/register", component: RegisterPage },
    ],
  });
  router.push("/register");
  await router.isReady();

  wrapper = mount(RegisterPage, { global: { plugins: [pinia, router] } });
  return useSystemStore(pinia);
}

beforeEach(() => {
  vi.mocked(sendSmsCode).mockReset();
});

describe("RegisterPage", () => {
  it("发码带 purpose=register(登录通道的发码方向与它相反,发错后端静默不发)", async () => {
    await mountRegister();
    await wrapper.find('input[placeholder="手机号"]').setValue("13711112222");

    await wrapper.find('button[type="button"]').trigger("click");
    await flushPromises();

    expect(sendSmsCode).toHaveBeenCalledWith("13711112222", "register");
  });

  it("提交 → store.register(手机号,验证码,密码) → 跳转 /", async () => {
    const store = await mountRegister();
    const register = vi.spyOn(store, "register").mockResolvedValue(undefined);
    await wrapper.find('input[placeholder="手机号"]').setValue("13711112222");
    await wrapper.find('input[placeholder="验证码"]').setValue("654321");
    await wrapper
      .find('input[placeholder="密码（至少 8 位）"]')
      .setValue("register-pass123");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(register).toHaveBeenCalledWith(
      "13711112222",
      "654321",
      "register-pass123",
    );
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("后端 400(已注册/验码失败) → detail 原样透出,留在本页", async () => {
    const store = await mountRegister();
    vi.spyOn(store, "register").mockRejectedValue(
      new ApiError(400, "client", "该手机号已注册"),
    );
    await wrapper.find('input[placeholder="手机号"]').setValue("13800000000");
    await wrapper.find('input[placeholder="验证码"]').setValue("654321");
    await wrapper
      .find('input[placeholder="密码（至少 8 位）"]')
      .setValue("register-pass123");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("该手机号已注册");
    expect(router.currentRoute.value.path).toBe("/register");
  });
});
