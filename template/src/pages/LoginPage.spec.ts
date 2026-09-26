import { sendSmsCode } from '@/api/auth';
import { ApiError } from '@/api/types';
import { useSystemStore } from '@/stores/system';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import LoginPage from './LoginPage.vue';

/**
 * LoginPage 的**页面级分流**回归锁。client.spec 锁的是错误形状(拍平 code),
 * 这里锁的是页面怎么用它 —— 409 进不了步进视图那次踩坑,两边缺一不可。
 */

// 只替掉 sendSmsCode(断言「409 不自动发码」),store 动作保持真身再用 spy 掉。
vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  sendSmsCode: vi.fn(),
}));

let wrapper: VueWrapper;
let router: Router;

async function mountLogin(): Promise<ReturnType<typeof useSystemStore>> {
  const pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/login', component: LoginPage },
    ],
  });
  router.push('/login');
  await router.isReady();

  wrapper = mount(LoginPage, { global: { plugins: [pinia, router] } });
  return useSystemStore(pinia);
}

async function fillPasswordForm() {
  await wrapper.find('input[placeholder="手机号"]').setValue('13800000000');
  await wrapper.find('input[placeholder="密码"]').setValue('spike-password');
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  vi.mocked(sendSmsCode).mockReset();
});

describe('LoginPage 分流', () => {
  it('409 DEVICE_VERIFICATION_REQUIRED → 切步进视图:提示+掩码手机号+不自动发码', async () => {
    const store = await mountLogin();
    vi.spyOn(store, 'loginAs').mockRejectedValue(
      new ApiError(409, 'client', 'Conflict', 'DEVICE_VERIFICATION_REQUIRED'),
    );

    await fillPasswordForm();

    expect(wrapper.text()).toContain('本次在新设备上登录');
    expect(wrapper.text()).toContain('138****0000');
    expect(wrapper.find('button[type="submit"]').text()).toBe('验证并登录');
    // 关键两条:不能落进 messageOf 显示成「密码错误」;也不能替用户把码发了
    expect(wrapper.text()).not.toContain('手机号或密码错误');
    expect(vi.mocked(sendSmsCode)).not.toHaveBeenCalled();

    // 没填码就提交 → 停在步进视图并提示,不发网络请求
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('请输入验证码');
    expect(wrapper.text()).toContain('本次在新设备上登录');
  });

  it('401 密码错 → 显示后端 detail(不是「服务暂不可用」),留在密码视图', async () => {
    const store = await mountLogin();
    vi.spyOn(store, 'loginAs').mockRejectedValue(
      new ApiError(401, 'unauthorized', '手机号或密码错误'),
    );

    await fillPasswordForm();

    expect(wrapper.text()).toContain('手机号或密码错误');
    expect(wrapper.text()).not.toContain('服务暂不可用');
    expect(wrapper.text()).not.toContain('本次在新设备上登录');
  });
});
