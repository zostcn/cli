# zostcn/cli

`zost.cn` 生态的**前端脚手架 + 模板本体**,同一个仓库(设计见 `api` 仓库的
`docs/新后端与前端模板设计及迁移方案.md` §2.3 / §2.6):

```
cli/
├── src/
│   ├── index.ts        # 命令行:参数校验 + 交互问答
│   └── scaffold.ts     # 拷贝 template/ + 变量替换(规则校验命中次数)
├── scripts/smoke.mjs   # 自测:生成 → 断言替换/排除/守卫
└── template/           # 模板本体(机制层,单独可用)
```

## 用法

```bash
npx github:zostcn/cli create my-app    # 从 GitHub 直接跑,不必先发 npm
npx zost-cli create my-app             # 发布 npm 后
```

脚手架做三件事:① 问答(只有项目名) → ② 拷贝 `template/` → ③ 变量替换。
替换的落点:`package.json`/`package-lock` 的 name、`index.html` 的 title、
vite 的 `base`(生产挂 `/<项目名>/`,dev 留根)、nginx 的 `<项目名>` 占位、README 开头。

一个已知的坑:npm 包**无条件剔除** `.gitignore` / `.npmrc`(`files` 白名单也救不回)——
所以脚手架内置了这两个文件的兜底内容,拷完缺失才写;内容与 `template/` 里逐字一致,
`npm test` 断言相等防漂移。

**模板和脚手架必须同仓库**:变量替换是逐字标记匹配,改了模板没同步
`scaffold.ts` 的规则,`npm test` 直接红 —— 这正是要防的「生成出来的项目路径不对」。

## 开发

```bash
npm install      # 装 typescript(只在构建时用,脚手架零运行时依赖)
npm test         # tsc 构建 + smoke 自测
```

端到端验证(发版前手动跑一次):

```bash
node dist/index.js create tmp-app && cd tmp-app
npm install && npm test && npm run build   # 生成的项目自身全绿才算数
```

## 边界

- **不做回灌**:已经生成的项目不会自动获得模板后续修改;长期共用的组件抽独立 npm 包。
- 认证**一律会话模式**(模板只对接 v2);跨站需要 Bearer 的项目照模板 README 手换适配器。
