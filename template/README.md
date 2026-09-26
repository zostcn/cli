# zost 前端模板

`zostcn/cli` 仓库的 `template/` —— **机制完整,不含任何「长什么样」的决定**(§2.2)。
起项目用脚手架:`npx github:zostcn/cli create <项目名>`(拷本目录手改 name / base / title 也行)。
设计见 `api` 仓库的 `docs/新后端与前端模板设计及迁移方案.md` §2。

## 跑起来

```bash
npm install          # Node ≥22.12(volta 已钉 22.18);.npmrc 的 legacy-peer-deps 是必须的
npm run dev          # http://localhost:5173,/api 代理到 127.0.0.1:8080
```

前置:本地后端在跑(`api` 仓库 `./mvnw spring-boot:run`,dev profile)。

种子账号见下方 SQL:`13900000000` / `admin123`。

### 种子管理员

注册页(`POST /api/auth/register`)已开放,注册拿到的是 **user 角色**;
要 **admin** 才走这个 SQL(或注册后手动改 rel 行):

```sql
-- 密码哈希是 bcrypt("admin123"),生成方式:
--   python -c "import bcrypt;print(bcrypt.hashpw(b'admin123',bcrypt.gensalt()).decode())"
-- ⚠️ 手机号**别用 13800000000** —— 那是后端测试(AuthFlowSupport)的固定测试号。
--    `./mvnw test` 打的是独立库 zost_api_test,动不到这里;但**从 IDE 跑测试**
--    不走 surefire 会回落 .env 的 dev 库,把种子删掉(实测踩过:种子神秘消失)。
INSERT INTO `user` (phone, password, nickname, role_key, status_key, created_at, updated_at)
VALUES ('13900000000', '$2b$10$……替换为上面生成的哈希……', 'admin', 'admin', 'active', NOW(), NOW());

-- RBAC0:授权读 rel 表,只写 role_key 不插这行会 403(库表无外键,顺序随意)
INSERT INTO rbac_user_role_rel (user_id, role_id)
SELECT u.id, r.id FROM `user` u JOIN rbac_role r
 WHERE u.phone = '13900000000' AND r.code = 'admin';
```

## 命令

| 命令             | 干什么                                                          |
| ---------------- | --------------------------------------------------------------- |
| `npm run dev`    | 开发服务器(dev 无 `VITE_API_BASE_URL` 时自动走代理)             |
| `npm run build`  | `vue-tsc` 类型检查 + 产物构建                                   |
| `npm test`       | Vitest —— 守卫顺序 / 路由过滤 / 错误归一化 / 主题白名单         |
| `npm run lint`   | ESLint(含 `vue/no-v-html`,**只管质量不带格式** —— 见规矩 4)     |
| `npm run format` | Prettier 全仓格式化(默认配置;IDE 保存时插件跑的就是同一套)      |
| `npm run gen`    | orval 重新生成 `src/api/generated/`(**需要本地后端 8080 在跑**) |

## 四条不许破的规矩

1. **`src/api/generated/` 提交进仓库、不许手改**(§2.7)。
   后端改契约 → `npm run gen` → diff 直接可见;要改行为改 `src/api/client.ts` 或后端规范。
2. **CSRF token 只在内存**(`src/api/memory.ts`),不落 localStorage —— 它随会话轮换。
   `GET /api/auth/me` 是会话与 token 的唯一权威来源。
3. **错误分流只看 HTTP status,绝不看 body 里的 `code`**(B4)—— v1 的 401 曾把
   code 写成 500,判它会把「没登录」误读成「服务器炸了」。
4. **格式归 Prettier、质量归 ESLint,不许互相越界** —— `eslint.config.js` 最后一项
   `eslint-config-prettier` 关掉了全部格式类规则;谁再往 ESLint 加格式规则,
   或绕开 `npm run format` 手调风格,就会重现「格式化一次、lint 打回来」的拉锯。

## 跨站项目换令牌通道(§2.5)

模板默认**会话模式**(同站)。`tab` / `photo-backup-electron` / `blog` 这类跨站客户端
cookie 发不出去(`SameSite=Lax`,浏览器规则),换 **v2 Bearer 令牌通道**:

1. `src/api/auth.ts` 换成 `src/api/auth.token.ts` 的 export(`fetchUser` / `logout` / `setToken`)
2. 删掉登录 / 注册 / 账号安全页与对应路由 —— 令牌通道没有这些入口
3. store 里 `loginAs` / `loginWithSms` / `register` 三个动作一并删(它们 import 自 `auth.ts`)
4. 客户端拿到令牌(raw)后 `setToken(...)`,此后 `/me` 自动带 `Authorization: Bearer`,
   **免 CSRF**(后端 `BearerRequestMatcher` 豁免);无 refresh 概念,失效即重签

> ⚠️ **首个令牌怎么拿,v2 还没有匿名端点** —— `POST /api/auth/token/issue` 要求已有登录态,
> 「密码换令牌」不存在。迁这三个项目时先定首签方式(候选:登录接口加 `issueToken=true`、
> 或管理员预签)。在那之前 `auth.token.ts` 只覆盖「已有令牌如何携带」。

`MeResponse` 形状不变,store 其余部分 / guard / 主题对通道无感。

## 关键文件地图

| 要改什么                               | 改哪                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 横切逻辑(CSRF / 401 / 403 分流 / 超时) | `src/api/client.ts`(**唯一出口**)                                                                                    |
| 认证适配器                             | `src/api/auth.ts`(会话,默认)/ `auth.token.ts`(跨站 Bearer,换法见上一节)                                              |
| 路由与菜单                             | `src/router/routes.ts`(`meta.roles` 写一处,菜单从路由树派生)                                                         |
| 顶栏 / 导航 / 退出                     | `src/layouts/DefaultLayout.vue`(子路由写 `meta.title` 才进导航,roles 复用 `filter.ts`;换长相整个换掉它,派生逻辑照抄) |
| 权限过滤逻辑                           | `src/router/filter.ts`(纯函数,有测试锁着)                                                                            |
| 颜色 / 主题                            | `src/theme/tokens.css`(6 个语义 token,清空了默认调色板)                                                              |
| 守卫四步                               | `src/router/guard.ts`(顺序即正确性,注释写明调错会怎样)                                                               |
| 部署 / CSP                             | `deploy/nginx.conf.example`                                                                                          |
| 接口生成范围                           | `orval.config.ts` 的 `filters.tags`(模块 tag = 按需生成粒度)                                                         |

## 已知的坑(都实测过,别重踩)

- **orval `client` 与 `httpClient` 是两个选项**:只设 `client: 'vue-query'` 时
  HTTP 底座默认 `fetch`,生成 `(url, {body})` 风格 + `{data,status,headers}` 信封,
  与本模板的 mutator 对不上。必须显式 `httpClient: 'axios'`。
- **守卫里注入动态路由后要 `next({path: to.fullPath})` 重进**:展开 `...to` 会把
  注入前解析的旧 `name`(如 catch-all)带过去,新路由白注入。
- **catch-all 路由不能标 `meta.public`**:注入前守卫目标都先被它解析掉,
  守卫在「公开页」一步就放行,永远走不到注入那步。
- `npm install` 不带 `.npmrc` 的 `legacy-peer-deps=true` 会撞 npm 10.8.2 的
  arborist 崩溃(`edgesOut`);`ajv` 必须是显式依赖(顶层会被别的包提升成 v6)。
