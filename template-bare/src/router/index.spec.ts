import { describe, expect, it } from "vitest";
import { createAppRouter } from ".";

/**
 * 路由冒烟:静态两跳(/ 与 catch-all)是白板唯一的导航契约。
 * 用 resolve 而不是 push —— 不装组件、不起导航,纯解析就够。
 */
describe("静态路由", () => {
  it("/ 解析到首页", () => {
    expect(createAppRouter().resolve("/").name).toBe("home");
  });

  it("未知路径落 catch-all(404)", () => {
    expect(createAppRouter().resolve("/nope/deep").name).toBe("not-found");
  });
});
