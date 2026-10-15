import { changePassword, sendSmsCode } from "@/api/auth";
import { useSystemStore } from "@/stores/system";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import SettingsPage from "./SettingsPage.vue";

/**
 * SettingsPage 回归锁:改密唯一凭据 = 新密码 + 短信码 ——
 * 码路径是「短信登录进来忘密码」的闭环,别退化回旧密码必填。
 * 验证码栏必须排在确认新密码之后(表单动线)。
 */

vi.mock("@/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/auth")>()),
  changePassword: vi.fn(),
  sendSmsCode: vi.fn(),
}));

let wrapper: VueWrapper;

async function mountSettings() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      { path: "/settings", component: SettingsPage },
      { path: "/devices", component: { template: "<div/>" } },
    ],
  });
  router.push("/settings");
  await router.isReady();

  wrapper = mount(SettingsPage, { global: { plugins: [pinia, router] } });
  // /me 带回本人手机号 —— 发码与掩码展示都靠它
  useSystemStore(pinia).user = {
    id: "1",
    nickname: "spike",
    phone: "13800000000",
    roles: ["user"],
    permissions: [],
  };
}

function buttonByText(text: string) {
  const btn = wrapper.findAll("button").find((b) => b.text() === text);
  expect(btn, `找不到按钮「${text}」`).toBeTruthy();
  return btn!;
}

beforeEach(() => {
  vi.mocked(changePassword).mockReset().mockResolvedValue(undefined);
  vi.mocked(sendSmsCode).mockReset().mockResolvedValue(undefined);
});

describe("SettingsPage 改密码", () => {
  it("验证码栏排在确认新密码之后", async () => {
    await mountSettings();
    const placeholders = wrapper.findAll("input").map((i) =>
      i.attributes("placeholder"),
    );
    expect(placeholders).toEqual([
      "新密码（至少 8 位）",
      "确认新密码",
      "验证码",
    ]);
  });

  it("两次输入不一致 → 本地拦下,不发请求", async () => {
    await mountSettings();
    await wrapper
      .find('input[placeholder="新密码（至少 8 位）"]')
      .setValue("new-pass-456");
    await wrapper
      .find('input[placeholder="确认新密码"]')
      .setValue("new-pass-999");
    await wrapper.find('input[placeholder="验证码"]').setValue("112233");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("两次输入的新密码不一致");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("发码给本人手机号(login purpose),掩码号可见", async () => {
    await mountSettings();

    expect(wrapper.text()).toContain("138****0000");
    await buttonByText("发送验证码").trigger("click");
    await flushPromises();

    expect(sendSmsCode).toHaveBeenCalledWith("13800000000", "login");
  });

  it("缺验证码 → 本地拦下,不发请求", async () => {
    await mountSettings();
    await wrapper
      .find('input[placeholder="新密码（至少 8 位）"]')
      .setValue("new-pass-456");
    await wrapper
      .find('input[placeholder="确认新密码"]')
      .setValue("new-pass-456");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("请输入验证码");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("填码提交 → changePassword({code, newPassword}),成功后清表单", async () => {
    await mountSettings();
    await wrapper
      .find('input[placeholder="新密码（至少 8 位）"]')
      .setValue("new-pass-456");
    await wrapper
      .find('input[placeholder="确认新密码"]')
      .setValue("new-pass-456");
    await wrapper.find('input[placeholder="验证码"]').setValue("112233");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(changePassword).toHaveBeenCalledWith({
      code: "112233",
      newPassword: "new-pass-456",
    });
    expect(wrapper.text()).toContain("其他设备上的登录已退出");
    expect(
      (
        wrapper.find('input[placeholder="新密码（至少 8 位）"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("");
  });

  it("新密码 <8 位 → 本地拦下", async () => {
    await mountSettings();
    await wrapper
      .find('input[placeholder="新密码（至少 8 位）"]')
      .setValue("short");
    await wrapper.find('input[placeholder="确认新密码"]').setValue("short");
    await wrapper.find('input[placeholder="验证码"]').setValue("112233");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("密码至少 8 位");
    expect(changePassword).not.toHaveBeenCalled();
  });
});
