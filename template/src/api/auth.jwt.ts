import { http } from "./client";
import type { MeResponse } from "./generated/models";

/**
 * JWT 过渡态适配器(§2.5)—— **休眠中,不被引用**。
 *
 * 给还没迁 v2 后端的项目用:同一个 `MeResponse` 形状,~20 行,
 * 让模板不必等后端。切换方式:在 `auth.ts` 里把三个函数的实现换成这里的。
 *
 * 旧接口事实(v1 `java-serve-main`):`POST /api/user/current`(Bearer 令牌),
 * 返回 `UserVO{id, username, avatar, …}` —— **不含 role**,
 * 所以 roles 给保守默认值;需要真实角色的项目按自己的旧接口补一行映射。
 */
interface LegacyCurrentUser {
  id: string | number;
  username?: string;
}

export async function fetchUserJwt(): Promise<MeResponse> {
  const token = localStorage.getItem("access_token");
  const { data } = await http.post<LegacyCurrentUser>(
    "/api/user/current",
    {},
    { headers: { Authorization: `Bearer ${token ?? ""}` } },
  );
  return {
    user: {
      id: String(data.id),
      nickname: data.username ?? "",
      roles: ["user"],
      permissions: [],
    },
    csrfToken: "", // 令牌通道免 CSRF(BearerRequestMatcher 豁免),字段留空
  };
}
