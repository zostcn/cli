import type { Directive } from "vue";
import { useSystemStore } from "@/stores/system";

/**
 * `v-permission="'content:publish'"`(或数组,任一命中即显示)。
 *
 * 权限三层(B7)的第二层:**运行时过滤**。第一层是编译期的类型/常量,
 * 第三层是路由守卫兜底。
 *
 * ⚠️ **前端隐藏不是安全** —— 后端 `RbacAuthorizationManager` 每请求独立判定,
 * 这里砍掉的只是按钮的可见性(体验),不是授权本身。
 */
function hasPermission(
  store: ReturnType<typeof useSystemStore>,
  value: unknown,
): boolean {
  if (typeof value === "string") return store.permissions.includes(value);
  if (Array.isArray(value))
    return value.some((code) => store.permissions.includes(String(code)));
  return true; // 没给值不猜,显示
}

export const vPermission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    if (!hasPermission(useSystemStore(), binding.value)) {
      el.parentNode?.removeChild(el);
    }
  },
};
