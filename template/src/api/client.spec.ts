import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCsrf, onAuthCleared, setCsrf } from './memory';
import { customInstance, http } from './client';

type Reply = {
  status: number;
  data?: unknown;
  headers?: Record<string, string>;
  /** true = 网络层失败(无 response,status 归 0) */
  networkDown?: boolean;
};

/** 每个用例换一次 adapter,拿到 config 供断言。 */
function stub(reply: Reply | ((config: InternalAxiosRequestConfig) => Reply)) {
  const seen: InternalAxiosRequestConfig[] = [];
  http.defaults.adapter = async (config) => {
    seen.push(config);
    const r = typeof reply === 'function' ? reply(config) : reply;
    if (r.networkDown) {
      throw new AxiosError('network error', 'ERR_NETWORK', config, null);
    }
    const response = {
      data: r.data,
      status: r.status,
      statusText: String(r.status),
      headers: r.headers ?? {},
      config,
    };
    if (r.status >= 400) {
      throw new AxiosError(`Request failed with status ${r.status}`, 'ERR_BAD_RESPONSE', config, null, response);
    }
    return response;
  };
  return seen;
}

const originalAdapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = originalAdapter;
  clearCsrf();
});

describe('错误归一化(只看 status,B4)', () => {
  it('401 → kind unauthorized,并广播 auth-cleared', async () => {
    // 夹具用**真实形状**:code 拍平在顶层(Spring 序列化 ProblemDetail.properties 的方式)。
    // 早先写成 properties:{code} 嵌套 —— 与实际响应不符,测试绿但生产取空(踩过)。
    stub({
      status: 401,
      data: { status: 401, detail: '未登录', code: 'UNAUTHORIZED' },
    });
    const onCleared = vi.fn();
    const off = onAuthCleared(onCleared);

    await expect(customInstance({ url: '/api/x', method: 'GET' })).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(onCleared).toHaveBeenCalledTimes(1);
    off();
  });

  it('403 分流:带 X-CSRF-Failed → csrf;不带 → forbidden', async () => {
    stub({ status: 403, data: { status: 403 }, headers: { 'X-CSRF-Failed': 'true' } });
    await expect(customInstance({ url: '/api/x', method: 'POST', data: '{}' })).rejects.toMatchObject({
      kind: 'csrf',
    });

    stub({ status: 403, data: { status: 403, code: 'FORBIDDEN' } });
    await expect(customInstance({ url: '/api/x', method: 'GET' })).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });

  it('响应体里有 code 字段也**不看** —— 分流只认 HTTP status', async () => {
    // v1 的 401 曾把 code 写成 500:判 code 会把「没登录」误读成「服务器炸了」
    stub({ status: 401, data: { code: 500, msg: 'boom' } });
    await expect(customInstance({ url: '/api/x', method: 'GET' })).rejects.toMatchObject({
      kind: 'unauthorized',
      // 数字 code 不是 ProblemDetail 的元数据,不该被带进 ApiError.code
      code: undefined,
    });

    // 反向:200 带 code:500 → 正常返回,body 原样,不抛
    stub({ status: 200, data: { code: 500, data: 'ok' } });
    await expect(customInstance({ url: '/api/x', method: 'GET' })).resolves.toEqual({
      code: 500,
      data: 'ok',
    });
  });

  it('429 → rate_limited', async () => {
    stub({ status: 429, data: { status: 429, code: 'RATE_LIMITED' } });
    await expect(customInstance({ url: '/api/x', method: 'POST' })).rejects.toMatchObject({
      kind: 'rate_limited',
    });
  });

  it('409 步进:顶层 code 原样带进 ApiError.code(LoginPage 分流靠它)', async () => {
    // 这条是 409 进不了步进视图那次回归的锁:code 必须从**顶层**取(拍平序列化),
    // 且 kind 必须是 client(不是 unauthorized —— 401 会触发登出)。
    stub({
      status: 409,
      data: { status: 409, detail: '新设备登录需要短信验证', code: 'DEVICE_VERIFICATION_REQUIRED' },
    });
    await expect(customInstance({ url: '/api/x', method: 'POST', data: '{}' })).rejects.toMatchObject({
      kind: 'client',
      status: 409,
      code: 'DEVICE_VERIFICATION_REQUIRED',
    });
  });

  it('网络断(无 response)→ unavailable', async () => {
    stub({ status: 0, networkDown: true });
    await expect(customInstance({ url: '/api/x', method: 'GET' })).rejects.toMatchObject({
      kind: 'unavailable',
      status: 0,
    });
  });

  it('5xx → unavailable', async () => {
    stub({ status: 503, data: { status: 503 } });
    await expect(customInstance({ url: '/api/x', method: 'GET' })).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });
});

describe('请求拦截', () => {
  it('内存有 token 时,POST 注入 X-XSRF-TOKEN;GET 不注入', async () => {
    setCsrf('csrf-abc');
    const seen = stub({ status: 200, data: {} });

    await customInstance({ url: '/api/x', method: 'POST', data: '{}' });
    expect(seen[0]?.headers.get('X-XSRF-TOKEN')).toBe('csrf-abc');

    await customInstance({ url: '/api/x', method: 'GET' });
    expect(seen[1]?.headers.get('X-XSRF-TOKEN')).toBeFalsy();
  });

  it('没有 token(首次匿名访问)→ 不注入,不报错', async () => {
    const seen = stub({ status: 200, data: {} });
    await customInstance({ url: '/api/x', method: 'POST', data: '{}' });
    expect(seen[0]?.headers.get('X-XSRF-TOKEN')).toBeFalsy();
  });

  it('FormData → timeout 置 0(B12):全局 15s 会把大文件中途 abort', async () => {
    const seen = stub({ status: 200, data: {} });
    await customInstance({ url: '/api/upload', method: 'POST', data: new FormData() });
    expect(seen[0]?.timeout).toBe(0);
  });
});
