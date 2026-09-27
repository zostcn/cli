import { cp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 模板目录与 dist/ 同级(npm 包 files = ["dist", "template"])。 */
const TEMPLATE_DIR = fileURLToPath(new URL("../template/", import.meta.url));

/** 拷贝时整目录跳过 —— node_modules / dist / .git 不是模板的一部分。 */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/**
 * 模板 README 开头那段自我介绍(生成的项目里它不再成立)。
 * 逐字匹配;行尾按目标文件的实际 EOL 拼,免得换台机器 CRLF 检出就失配。
 */
const README_INTRO_LINES = [
  "# zost 前端模板",
  "",
  "`zostcn/cli` 仓库的 `template/` —— **机制完整,不含任何「长什么样」的决定**(§2.2)。",
  "起项目用脚手架:`npx github:zostcn/cli create <项目名>`(拷本目录手改 name / base / title 也行)。",
  "设计见 `api` 仓库的 `docs/新后端与前端模板设计及迁移方案.md` §2。",
];

/**
 * npm 包**无条件剔除** `.gitignore` / `.npmrc`(npm-packing 规则,
 * `files` 白名单也救不回,实测 npm 10.8.2)。走 registry 的脚手架因此拷不到它们:
 * 生成的项目会缺 `.npmrc`(`npm install` 撞 arborist 崩溃)与 `.gitignore`(`.env` 可能被提交)。
 * 拷完若仍缺失就用这里兜底写;内容必须与 `template/` 里那两个文件逐字一致 —— smoke 断言相等防漂移。
 */
export const DOTFILE_FALLBACK: Record<string, string> = {
  ".gitignore": `node_modules/
dist/
.env
.env.*
!.env.example
*.local
`,
  ".npmrc": `# npm 10.8.2 的 arborist 解析 vitest 5 的 peer 图时会崩
# (\`TypeError: Cannot read properties of null (reading 'edgesOut')\`,#  @npmcli/arborist build-ideal-tree #loadPeerSet)。
# legacy-peer-deps 绕开该路径;模板的依赖是精确版本(D4),peer 宽松解析不引入漂移。
legacy-peer-deps=true
`,
};

interface Rule {
  /** 相对模板根的文件 */
  file: string;
  /** 生成结果里必须逐字消失的模板标记 */
  find: string;
  /** 替换文本(已含项目名) */
  to: string;
  /** 期望命中次数;`-1` = 至少 1 次(该文件里标记会重复出现) */
  expected: number;
}

function rulesFor(projectName: string): Rule[] {
  return [
    {
      file: "package.json",
      find: `"name": "zost-template"`,
      to: `"name": "${projectName}"`,
      expected: 1,
    },
    {
      file: "package-lock.json",
      find: `"name": "zost-template"`,
      to: `"name": "${projectName}"`,
      expected: 2,
    },
    {
      file: "index.html",
      find: `<title>zost</title>`,
      to: `<title>${projectName}</title>`,
      expected: 1,
    },
    {
      // 子路径部署:生产挂 /<项目名>/,dev 留根路径(README 的 5173 根地址照旧成立)。
      // router 用 import.meta.env.BASE_URL,base 一改它自动跟着,不用第二处替换。
      file: "vite.config.ts",
      find: `base: "/",`,
      to: `base: mode === "production" ? "/${projectName}/" : "/", // 子路径部署(脚手架生成);dev 留根`,
      expected: 1,
    },
    {
      // nginx 参考配置里通篇是 <项目名> 占位(含头部注释),全部替换。
      file: "deploy/nginx.conf.example",
      find: `<项目名>`,
      to: projectName,
      expected: -1,
    },
    {
      // 部署流水线的站点 conf(测试机形态,生成即可推)。精确计数 12:
      // 模板增删占位必须同步这里,防漏替换出半参数化的 conf。
      file: "deploy/nginx.conf",
      find: `<项目名>`,
      to: projectName,
      expected: 12,
    },
    {
      // workflow 只有 env 块的 PROJECT 一处参数化,注释里不许再出现占位。
      file: ".github/workflows/deploy.yml",
      find: `PROJECT: <项目名>`,
      to: `PROJECT: ${projectName}`,
      expected: 1,
    },
  ];
}

/** 拷贝前逐项过滤。返回 false 则该路径(cp 对目录是整棵子树)不进生成结果。 */
function keep(src: string): boolean {
  const base = path.basename(src);
  if (SKIP_DIRS.has(base)) return false;
  if (base === ".DS_Store") return false;
  if (base.endsWith(".local")) return false; // .env.local 之类(gitignore 同款规则)
  if (base === ".env" || (base.startsWith(".env.") && base !== ".env.example")) {
    return false;
  }
  return true;
}

function count(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * 把模板复制到 targetDir,并按 rules 做变量替换。
 *
 * 每条规则都**校验命中次数**(模板改了标记而脚手架没同步 → 直接抛,
 * 不静默生成一个名字没换掉的项目):这正是「模板与脚手架必须同仓库」要防的事故。
 */
export async function scaffold(
  projectName: string,
  targetDir: string,
): Promise<void> {
  const tpl = await stat(TEMPLATE_DIR).catch(() => null);
  if (!tpl?.isDirectory()) {
    throw new Error(`找不到模板目录:${TEMPLATE_DIR}(npm 包的 files 里必须带 template/)`);
  }
  if (await stat(targetDir).catch(() => null)) {
    throw new Error(`目标目录已存在:${targetDir}\n换个项目名,或先移走它。`);
  }

  await mkdir(targetDir, { recursive: false });
  try {
    await cp(TEMPLATE_DIR, targetDir, { recursive: true, filter: keep });

    for (const rule of rulesFor(projectName)) {
      const file = path.join(targetDir, rule.file);
      const content = await readFile(file, "utf8");
      const hits = count(content, rule.find);
      const ok = rule.expected === -1 ? hits >= 1 : hits === rule.expected;
      if (!ok) {
        throw syncError(rule, hits);
      }
      await writeFile(file, content.split(rule.find).join(rule.to), "utf8");
    }

    await replaceReadmeIntro(targetDir, projectName);

    // registry 包里没有这两个文件(见 DOTFILE_FALLBACK 注释),缺失才写。
    for (const [name, content] of Object.entries(DOTFILE_FALLBACK)) {
      const file = path.join(targetDir, name);
      if (!(await stat(file).catch(() => null))) {
        await writeFile(file, content, "utf8");
      }
    }
  } catch (e) {
    // 半成品目录留着会挡住重试(下一次报「目标目录已存在」),清掉再抛。
    await rm(targetDir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

async function replaceReadmeIntro(
  targetDir: string,
  projectName: string,
): Promise<void> {
  const file = path.join(targetDir, "README.md");
  const content = await readFile(file, "utf8");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const find = README_INTRO_LINES.join(eol);
  if (!content.includes(find)) {
    throw syncError({ file: "README.md", find, to: "", expected: 1 }, 0);
  }
  const to = [
    `# ${projectName}`,
    "",
    "> 由 `zost-cli create` 生成(模板:`zostcn/cli` 仓库的 `template/`)。",
    "> 下面的命令、规矩与已知的坑对本项目同样适用。",
  ].join(eol);
  await writeFile(file, content.replace(find, to), "utf8");
}

function syncError(rule: Rule, hits: number): Error {
  const shown =
    rule.find.length > 60 ? rule.find.slice(0, 60) + "…" : rule.find;
  return new Error(
    `脚手架与模板不同步:${rule.file} 里标记命中 ${hits} 次(期望 ${
      rule.expected === -1 ? "≥1" : rule.expected
    })\n  标记:${JSON.stringify(shown)}\n` +
      `  模板改了这里 —— 同步修改 src/scaffold.ts 的规则,再重新生成。`,
  );
}
