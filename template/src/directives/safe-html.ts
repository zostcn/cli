import DOMPurify from 'dompurify';
import type { Directive } from 'vue';

/**
 * `v-safe-html` —— 唯一允许写 innerHTML 的通道(B11)。
 *
 * 两条纪律:
 * ① **双生命周期(mounted + updated)**:只在 mounted 清洗,数据变了以后
 *    更新的内容是没洗过的;
 * ② **必须配置**:DOMPurify 默认放行 HTML/SVG/MathML —— 裸 `.sanitize(x)`
 *    等于没洗(SVG 里的 foreignObject 可以夹带)。这里收窄到 HTML profile,
 *    再禁掉会引入样式/交互的标签属性。
 *
 * ESLint 的 `vue/no-v-html` 把裸 v-html 挡在门外;用这个指令要显式 disable,
 * 留下可搜索的痕迹。
 */
function apply(el: HTMLElement, value: unknown): void {
  const html = typeof value === 'string' ? value : '';
  el.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'math'],
    FORBID_ATTR: ['style'],
  });
}

export const vSafeHtml: Directive<HTMLElement, string> = {
  mounted: apply,
  updated: apply,
};
