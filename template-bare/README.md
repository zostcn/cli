# zost 白板模板

`zostcn/cli` 仓库的 `template-bare/` —— **空白页基线:只有工具链和骨架,没有登录/接口层**。
起项目用脚手架:`npx github:zostcn/cli create <项目名> --bare`(拷本目录手改 name / base / title 也行)。

## 跑起来

```bash
npm install          # Node ≥22.12(volta 已钉 22.18);.npmrc 的 legacy-peer-deps 是必须的
npm run dev          # http://localhost:5173/<项目名>/
```

没有后端、没有接口层 —— 要调接口的项目参照全量模板(`zostcn/cli` 仓库 `template/`)自行补。

## 命令

| 命令                | 干什么                                                       |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | 开发服务器                                                   |
| `npm run build`     | `vue-tsc` 类型检查 + 产物构建                                |
| `npm run typecheck` | 只跑类型检查                                                 |
| `npm test`          | Vitest —— 路由解析 / 主题白名单                              |
| `npm run lint`      | ESLint(含 `vue/no-v-html`,**只管质量不带格式** —— 见规矩 1) |
| `npm run format`    | Prettier 全仓格式化(默认配置;IDE 保存时插件跑的就是同一套)  |

## 两条不许破的规矩

1. **格式归 Prettier、质量归 ESLint,不许互相越界** —— `eslint.config.js` 最后一项
   `eslint-config-prettier` 关掉了全部格式类规则;谁再往 ESLint 加格式规则,
   或绕开 `npm run format` 手调风格,就会重现「格式化一次、lint 打回来」的拉锯。
2. **`VITE_*` 不带密钥语义、只提交 `.env.example`** —— `vite.config.ts` 构建期
   扫描 SECRET/KEY/PASSWORD/TOKEN,命中直接 throw;密钥进前端产物等于公开。

## 关键文件地图

| 要改什么                                 | 改哪                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 路由                                     | `src/router/index.ts`(静态两跳:首页 + 404,加页面往 `routes` 里添)                            |
| 页面                                     | `src/pages/`(`HomePage.vue` 是起点)                                                           |
| 颜色 / 主题                              | `src/theme/tokens.css`(6 个语义 token,清空了默认调色板)                                       |
| 首帧主题预置                             | `public/theme-init.js`(白名单校验;`<script>` 必须外链,CSP `script-src 'self'` 约束)           |
| 构建配置(别名 / base)                   | `vite.config.ts`(`base: "/",` 字面量是脚手架标记,生成时参数化)                                |
| 部署流水线                               | `.github/workflows/deploy.yml`(env 块集中改:服务器 / 保留数)                                   |
| 站点 conf(安全头 / 回退)                | `deploy/nginx.conf`(测试机形态,生成即可推)/ `deploy/nginx.conf.example`(生产形态参照)         |

## 部署(推送即上线)

前置(**全生态一次性**):仓库 secrets 配 `SSH_PRIVATE_KEY` + `SSH_KNOWN_HOSTS`
(与 `api` 仓同一套部署 key);服务器共享 nginx 已就位(见
`/srv/docker-app/nginx/docker-compose.yml` 头注释)。然后:

```bash
git init -b main && git add -A && git commit -m "init"
git remote add origin git@github.com:zostcn/<仓库名>.git && git push -u origin main
```

push `main` 即自动:测试 → 构建 → 版本化上传 `releases/<时间戳-短sha>` →
`nginx -t` 校验站点 conf 后热加载 → 原子切 `current` → 保留 3 个可回滚。
地址 = `http://<DEPLOY_HOST>/<项目名>/`。

换项目只改 workflow env 块的 `PROJECT`;换服务器改 `DEPLOY_HOST` + 两个 secrets。
上主站 = 挂主域子路径 `zost.cn/<项目名>/`:CI 只交 location 片段(主块的人工
include 收录),`deploy/nginx.conf` 换成 `.example` 的片段形态、conf 落点
`conf/` → `loc/` —— 逐条对照 `deploy/nginx.conf.example` 头注释。

## 已知的坑

- `npm install` 不带 `.npmrc` 的 `legacy-peer-deps=true` 会撞 npm 10.8.2 的
  arborist 崩溃(`edgesOut`)。
