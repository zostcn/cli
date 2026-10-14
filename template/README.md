# zost 前端模板

`zostcn/cli` 仓库的 `template/` —— **机制完整,不含任何「长什么样」的决定**。
起项目用脚手架:`npx github:zostcn/cli create <项目名>`(拷本目录手改 name / base / title 也行)。

## 跑起来

```bash
npm install          # Node ≥22.12(volta 已钉 22.18);.npmrc 的 legacy-peer-deps 是必须的
npm run gen          # 生成 src/api/generated/(不进仓库,首跑必做);需本地后端 8080,
                     # 或 OPENAPI_SPEC=<路径>/openapi.json npm run gen 吃 api 仓快照
npm run dev          # http://localhost:5173,/api 代理到 127.0.0.1:8080
```

前置:本地后端在跑(`api` 仓库 `./mvnw spring-boot:run`,dev profile)——只影响
`npm run dev` 的代理与 `gen` 的默认数据源,`gen` 可用 `OPENAPI_SPEC` 绕过。

种子账号见下方 SQL:`13900000000` / `admin123`。

### 种子管理员

注册页(`POST /api/auth/register`)已开放,注册拿到的是 **user 角色**;
要 **admin** 才走这个 SQL(或注册后手动改 rel 行):

```sql
-- 密码哈希是 bcrypt("admin123"),生成方式:
--   python -c "import bcrypt;print(bcrypt.hashpw(b'admin123',bcrypt.gensalt()).decode())"
-- ⚠️ 手机号**别用 13800000000** —— 那是后端测试(AuthFlowSupport)的固定测试号。
--    `./mvnw test` 打的是独立库 zost_api_test,动不到这里;但**从 IDE 跑测试**
--    不走 surefire 会回落 .env 的 dev 库,把种子删掉。
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
| `npm run gen`    | orval 重新生成 `src/api/generated/`(**不进仓库**,默认打本地 8080;或 `OPENAPI_SPEC=<路径>/openapi.json` 吃快照) |

## 四条不许破的规矩

1. **`src/api/generated/` 不进仓库、不许手改**。
   CI 每次拉 api 仓 `docs/openapi.json` 快照现生成,契约变更在构建期暴露;
   要改行为改 `src/api/client.ts`,要改契约改后端。
2. **CSRF token 只在内存**(`src/api/memory.ts`),不落 localStorage —— 它随会话轮换。
   `GET /api/auth/me` 是会话与 token 的唯一权威来源。
3. **错误分流只看 HTTP status,绝不看 body 里的 `code`** —— code 是随 body 带的
   元数据,与真实 status 脱节时判它,就会把「没登录」误读成「服务器炸了」。
4. **格式归 Prettier、质量归 ESLint,不许互相越界** —— `eslint.config.js` 最后一项
   `eslint-config-prettier` 关掉了全部格式类规则;谁再往 ESLint 加格式规则,
   或绕开 `npm run format` 手调风格,就会重现「格式化一次、lint 打回来」的拉锯。

## 关键文件地图

| 要改什么                               | 改哪                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 横切逻辑(CSRF / 401 / 403 分流 / 超时) | `src/api/client.ts`(**唯一出口**)                                                                                    |
| 认证适配器                             | `src/api/auth.ts`(cookie 会话,唯一通道)                                                                              |
| 路由与菜单                             | `src/router/routes.ts`(`meta.roles` 写一处,菜单从路由树派生)                                                         |
| 顶栏 / 导航 / 退出                     | `src/layouts/DefaultLayout.vue`(子路由写 `meta.title` 才进导航,roles 复用 `filter.ts`;换长相整个换掉它,派生逻辑照抄) |
| 权限过滤逻辑                           | `src/router/filter.ts`(纯函数,有测试锁着)                                                                            |
| 颜色 / 主题                            | `src/theme/tokens.css`(6 个语义 token,清空了默认调色板)                                                              |
| 守卫四步                               | `src/router/guard.ts`(顺序即正确性,注释写明调错会怎样)                                                               |
| 部署流水线                             | `.github/workflows/deploy.yml`(env 块集中改:服务器 / 保留数)                                                        |
| 站点 conf(CSP/回退/反代)              | `deploy/nginx.conf`(测试机形态,生成即可推)/ `deploy/nginx.conf.example`(生产形态参照)                              |
| 接口生成范围                           | `orval.config.ts` 的 `filters.tags`(模块 tag = 按需生成粒度)                                                         |

## 部署(推送即上线)

前置(**全生态一次性**):仓库 secrets 配 `SSH_PRIVATE_KEY` + `SSH_KNOWN_HOSTS`
(与 `api` 仓同一套部署 key)+ `API_REPO_TOKEN`(fine-grained PAT,Contents:Read,
只授 `zostcn/api` —— CI 拉 spec 快照);服务器共享 nginx 已就位(见
`/srv/docker-app/nginx/docker-compose.yml` 头注释)。然后:

```bash
git init -b main && git add -A && git commit -m "init"
git remote add origin git@github.com:zostcn/<仓库名>.git && git push -u origin main
```

push `main` 即自动:测试 → 构建(必须显式给 `VITE_API_BASE_URL=服务器IP`,留空直接构建失败)
→ 版本化上传 `releases/<时间戳-短sha>` → `nginx -t` 校验站点 conf 后热加载
→ 原子切 `current` → 保留 3 个可回滚。地址 = `http://<DEPLOY_HOST>/<项目名>/`,
`/api/` 由共享 nginx 同域反代到 `api:8080`(与 dev 同构,cookie/CSRF 零改造)。

换项目只改 workflow env 块的 `PROJECT`;换服务器改 `DEPLOY_HOST` + 两个 secrets。
上主站 = 挂主域子路径 `zost.cn/<项目名>/`:CI 只交 location 片段(主块的人工
include 收录),`deploy/nginx.conf` 换成 `.example` 的片段形态、conf 落点
`conf/` → `loc/`、`VITE_API_BASE_URL` 换 `https://zost.cn` —— 三条逐条对照
`deploy/nginx.conf.example` 头注释。

## 已知的坑

- **orval `client` 与 `httpClient` 是两个选项**:只设 `client: 'vue-query'` 时
  HTTP 底座默认 `fetch`,生成 `(url, {body})` 风格 + `{data,status,headers}` 信封,
  与本模板的 mutator 对不上。必须显式 `httpClient: 'axios'`。
- **守卫里注入动态路由后要 `next({path: to.fullPath})` 重进**:展开 `...to` 会把
  注入前解析的旧 `name`(如 catch-all)带过去,新路由白注入。
- **catch-all 路由不能标 `meta.public`**:注入前守卫目标都先被它解析掉,
  守卫在「公开页」一步就放行,永远走不到注入那步。
- `npm install` 不带 `.npmrc` 的 `legacy-peer-deps=true` 会撞 npm 10.8.2 的
  arborist 崩溃(`edgesOut`);`ajv` 必须是显式依赖(顶层会被别的包提升成 v6)。
