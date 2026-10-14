// 脚手架自测:① 从源码生成 → 断言替换/排除/守卫(full 与 bare 双变体);
// ② `npm pack` 出包再生成一次 → 覆盖 registry 路径(npm 剔除点文件的坑只在这条路上暴露)。
// 不跑 npm install(太重),安装后的真实验证见 README「端到端验证」。
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(root, "dist", "index.js");
const tmp = await mkdtemp(path.join(os.tmpdir(), "zost-cli-"));

/** 变体 → 模板目录名(与 src/scaffold.ts 的 TEMPLATE_DIRS 对应)。 */
const TEMPLATE_DIRS = { full: "template", bare: "template-bare" };

function run(args, cwd = tmp) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
}

// 按 EOL 归一再比:autocrlf 的机器上新克隆,模板里是 CRLF 而常量是 LF
const norm = (s) => s.replace(/\r\n/g, "\n");
const readIn = (dir, f) => readFile(path.join(dir, f), "utf8");

/** 占位替换全套断言(name/title/base/nginx/workflow/README)。 */
async function assertPlaceholders(dir, name) {
  const read = (f) => readIn(dir, f);

  const pkg = await read("package.json");
  assert.match(pkg, new RegExp(`"name": "${name}"`));
  assert.ok(!pkg.includes("zost-template"), "package.json 名字没换掉");

  const lock = await read("package-lock.json");
  assert.equal(
    (lock.match(new RegExp(`"name": "${name}"`, "g")) ?? []).length,
    2,
    "package-lock 里的两处 name 都要换",
  );
  assert.ok(!lock.includes("zost-template"), "lock 里残留旧名字");

  const html = await read("index.html");
  assert.ok(html.includes(`<title>${name}</title>`), "title 没换掉");
  assert.ok(!html.includes("<title>zost</title>"), "title 还是模板默认值");

  const vite = await read("vite.config.ts");
  assert.ok(
    vite.includes(`base: mode === "production" ? "/${name}/" : "/"`),
    "vite base 没被参数化",
  );
  assert.ok(!vite.includes(`base: "/",`), "vite base 还是模板默认值");

  const nginx = await read("deploy/nginx.conf.example");
  assert.ok(!nginx.includes("<项目名>"), "nginx.conf.example 残留占位");
  assert.ok(nginx.includes(`/srv/zost/${name}/webroot`), "example root 没换掉");

  const deployConf = await read("deploy/nginx.conf");
  assert.ok(!deployConf.includes("<项目名>"), "deploy/nginx.conf 残留占位");
  assert.ok(
    deployConf.includes(`/srv/zost/${name}/webroot`),
    "deploy/nginx.conf 路径没换掉",
  );

  const workflow = await read(".github/workflows/deploy.yml");
  assert.ok(workflow.includes(`PROJECT: ${name}`), "workflow 的 PROJECT 没参数化");
  assert.ok(!workflow.includes("<项目名>"), "workflow 残留占位");

  const readme = await read("README.md");
  assert.match(readme, new RegExp(`^# ${name}$`, "m"), "README 标题没换掉");
  // 共有前缀;bare 变体多 ` --bare`,在各自的用例里单独断言
  assert.ok(
    readme.includes("由 `zost-cli create"),
    "README 开头没换成生成说明",
  );

  // 排除项:构建产物不进生成结果,环境样例要进
  assert.ok(!existsSync(path.join(dir, "node_modules")), "node_modules 被拷进来了");
  assert.ok(!existsSync(path.join(dir, "dist")), "dist 被拷进来了");
  assert.ok(!existsSync(path.join(dir, ".env")), ".env 不该存在");
  assert.ok(existsSync(path.join(dir, ".env.example")), ".env.example 必须在");
}

// --- full 变体:默认(无 flag)从 template/ 生成 ---
const { status, stderr } = run(["create", "demo-app"]);
assert.equal(status, 0, `create 失败:\n${stderr}`);
const dir = path.join(tmp, "demo-app");
await assertPlaceholders(dir, "demo-app");
const fullReadme = await readIn(dir, "README.md");
assert.ok(!fullReadme.includes("# zost 前端模板"), "README 还在自称模板");

// --- 守卫:同名目录不覆盖、非法名拒绝 ---
const again = run(["create", "demo-app"]);
assert.notEqual(again.status, 0, "同名目录应当拒绝");
assert.ok(again.stderr.includes("已存在"), `报错不对:${again.stderr}`);
assert.ok(
  existsSync(path.join(dir, "package.json")),
  "拒绝生成时不能动已有目录",
);

const bad = run(["create", "Bad Name"]);
assert.notEqual(bad.status, 0, "非法项目名应当拒绝");

const unknownFlag = run(["create", "some-app", "--nope"]);
assert.notEqual(unknownFlag.status, 0, "未知 --flag 应当拒绝");
assert.ok(
  unknownFlag.stderr.includes("未知选项"),
  `未知选项报错不对:${unknownFlag.stderr}`,
);

// --- 点文件兜底:npm 包无条件剔除 .gitignore/.npmrc(scaffold 内置常量补写) ---
const { DOTFILE_FALLBACK } = await import(
  pathToFileURL(path.join(root, "dist", "scaffold.js")).href
);
for (const variant of ["full", "bare"]) {
  for (const [name, content] of Object.entries(DOTFILE_FALLBACK[variant])) {
    assert.equal(
      norm(await readFile(path.join(root, TEMPLATE_DIRS[variant], name), "utf8")),
      norm(content),
      `${variant} 的 ${name} 兜底常量与 ${TEMPLATE_DIRS[variant]}/ 里的文件必须逐字相同 —— 改一处另一处也要改`,
    );
  }
}
for (const name of Object.keys(DOTFILE_FALLBACK.full)) {
  assert.ok(existsSync(path.join(dir, name)), `生成结果缺 ${name}`);
}

// --- bare 变体:--bare 从 template-bare/ 生成 ---
const bareRun = run(["create", "demo-bare", "--bare"]);
assert.equal(bareRun.status, 0, `create --bare 失败:\n${bareRun.stderr}`);
const bdir = path.join(tmp, "demo-bare");
await assertPlaceholders(bdir, "demo-bare");
const bareReadme = await readIn(bdir, "README.md");
assert.ok(
  bareReadme.includes("由 `zost-cli create --bare` 生成"),
  "bare README 开头没换成 --bare 生成说明",
);
assert.ok(!bareReadme.includes("# zost 白板模板"), "bare README 还在自称模板");

// 白板没有接口/认证层,部署流水线两件必须在
for (const gone of [
  "src/api",
  "src/stores",
  "src/directives",
  "src/layouts",
  "orval.config.ts",
  "src/pages/LoginPage.vue",
]) {
  assert.ok(!existsSync(path.join(bdir, gone)), `白板不该有 ${gone}`);
}
for (const kept of [
  "deploy/nginx.conf",
  ".github/workflows/deploy.yml",
  "src/router/index.spec.ts",
]) {
  assert.ok(existsSync(path.join(bdir, kept)), `白板缺 ${kept}`);
}
for (const name of Object.keys(DOTFILE_FALLBACK.bare)) {
  assert.ok(existsSync(path.join(bdir, name)), `白板生成结果缺 ${name}`);
}

// --bare 在名字前后都行
const bareFirst = run(["create", "--bare", "demo-bare-first"]);
assert.equal(bareFirst.status, 0, `--bare 前置失败:\n${bareFirst.stderr}`);

// --- registry 路径:npm pack 出来的包再生成一次,点文件兜底要生效 ---
const packDir = path.join(tmp, "pack");
mkdirSync(packDir);
const pack = spawnSync(
  "npm",
  ["pack", "--pack-destination", packDir, "--silent"],
  { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
);
assert.equal(pack.status, 0, `npm pack 失败:\n${pack.stderr}`);
const tgz = pack.stdout.trim().split("\n").pop();
// 相对文件名 + cwd:Windows 反斜杠绝对路径传给 tar 会解不开
assert.equal(
  spawnSync("tar", ["-xzf", tgz], { cwd: packDir }).status,
  0,
  "解包失败(tar 不可用?)",
);
const pkgRoot = path.join(packDir, "package");
const fromPack = path.join(tmp, "from-pack");
mkdirSync(fromPack);

const keyFiles = [
  ".gitignore",
  ".npmrc",
  ".env.example",
  "package.json",
  "deploy/nginx.conf",
  // .github 在 npm 默认剔除名单的边缘地带(与 .gitignore/.npmrc 同类风险),
  // 这条断言是它进了包的唯一守卫 —— 没了它,registry 路径生成的项目不带流水线。
  ".github/workflows/deploy.yml",
];
function packCreate(name, ...extra) {
  const r = spawnSync(
    process.execPath,
    [path.join(pkgRoot, "dist", "index.js"), "create", name, ...extra],
    { cwd: fromPack, encoding: "utf8" },
  );
  assert.equal(r.status, 0, `从 npm 包里生成失败:\n${r.stderr}`);
  const d = path.join(fromPack, name);
  for (const f of keyFiles) {
    assert.ok(existsSync(path.join(d, f)), `registry 包生成的项目缺 ${f}`);
  }
  assert.ok(
    !existsSync(path.join(d, "node_modules")),
    "registry 包把 node_modules 拷进去了",
  );
  return d;
}

const pdir = packCreate("packed-app");
assert.match(await readIn(pdir, "package.json"), /"name": "packed-app"/);

const pdirBare = packCreate("packed-bare", "--bare");
assert.match(await readIn(pdirBare, "package.json"), /"name": "packed-bare"/);
assert.ok(
  !existsSync(path.join(pdirBare, "src/api")),
  "registry 包的白板模板带了 src/api",
);

console.log(
  `smoke OK —— 生成、替换、排除、守卫、点文件兜底、bare 变体、registry 包路径全部通过(${tmp})`,
);
