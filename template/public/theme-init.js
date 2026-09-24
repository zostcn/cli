/*
 * 主题预置 —— 在首帧渲染前给 <html> 挂类,避免 FOUC(先白后黑一闪)。
 *
 * 为什么是外链文件:index.html 的 CSP 是 script-src 'self',内联脚本会被拦。
 *
 * ⚠️ 白名单校验不可省:localStorage 的值是**用户可控输入**,
 * 不校验直接进 classList,一个被污染的存储值就可能带进奇怪的字符串。
 * 只认 'dark' / 'light',其余一律回落默认。
 */
(function () {
  var ALLOWED = ['dark', 'light'];
  var value = 'light';
  try {
    var stored = localStorage.getItem('theme');
    if (stored && ALLOWED.indexOf(stored) !== -1) {
      value = stored;
    }
  } catch {
    /* 隐私模式下 localStorage 可能抛错,保持默认即可 */
  }
  document.documentElement.classList.add(value);
})();
