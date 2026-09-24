import { describe, expect, it } from 'vitest';

/**
 * 主题预置脚本的白名单(B12/§2.4):localStorage 是用户可控输入,
 * 校验必须发生在 classList 之前。
 *
 * theme-init.js 是给 <script> 用的纯 JS,这里用 eval-equivalent 直接执行同一份源码,
 * 保证测的就是部署的那份文件(而不是重新实现一遍)。
 */
async function runThemeInit(stored: string | null): Promise<string> {
  document.documentElement.className = '';
  if (stored === null) {
    localStorage.removeItem('theme');
  } else {
    localStorage.setItem('theme', stored);
  }
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  // cwd = template 根(vitest 从那里启动);import.meta.url 在 vitest 里不是 file://
  const src = await readFile(resolve(process.cwd(), 'public/theme-init.js'), 'utf-8');
  new Function(src)();
  return document.documentElement.className;
}

describe('theme-init.js 白名单', () => {
  it('dark / light 原样生效', async () => {
    expect(await runThemeInit('dark')).toContain('dark');
    expect(await runThemeInit('light')).toContain('light');
  });

  it('注入尝试被拒绝 —— 只可能得到白名单里的类', async () => {
    const cls = await runThemeInit('"><script>alert(1)</script>');
    expect(cls).not.toContain('script');
    expect(cls).toContain('light'); // 回落默认
    expect(await runThemeInit('evil')).toContain('light');
  });

  it('无存储值 → light 默认', async () => {
    expect(await runThemeInit(null)).toContain('light');
  });
});
