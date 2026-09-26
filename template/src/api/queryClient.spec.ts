import { describe, expect, it } from 'vitest';
import { createQueryClient } from './queryClient';
import { ApiError } from './types';

describe('QueryClient 模板级默认值', () => {
  it('4xx 不重试(确定答复),unavailable 才重试,且最多 3 次', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry;
    expect(typeof retry).toBe('function');
    const shouldRetry = retry as (failureCount: number, error: unknown) => boolean;

    expect(shouldRetry(0, new ApiError(401, 'unauthorized', 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(409, 'client', 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(429, 'rate_limited', 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(503, 'unavailable', 'x'))).toBe(true);
    expect(shouldRetry(3, new ApiError(503, 'unavailable', 'x'))).toBe(false);
  });

  it('staleTime 30s —— refocus/重复挂载不打成串', () => {
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(30_000);
  });
});
