// 脚手架自测:① 从源码生成 → 断言替换/排除/守卫;② `npm pack` 出包再生成一次
// → 覆盖 registry 路径(npm 剔除点文件的坑只在这条路上暴露)。
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

function run(args, cwd = tmp) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
}

const { status, stderr, stdout } = run(["create", "demo-app"]);
assert.equal(status, 0, `create 失败:\n${stderr}`);

const dir = path.join(tmp, "demo-app");
const read = (f) => readFile(path.join(dir, f), "utf8");

// --- 变量替换:模板标记必须逐字消失 ---
const pkg = await read("package.json");
assert.match(pkg, /"name": "demo-app"/);
assert.ok(!pkg.includes("zost-template"), "package.json 名字没换掉");

const lock = await read("package-lock.json");
assert.equal(
  (lock.match(/"name": "demo-app"/g) ?? []).length,
  2,
  "package-lock 里的两处 name 都要换",
);
assert.ok(!lock.includes("zost-template"), "lock 里残留旧名字");

const html = await read("index.html");
assert.match(html, /<title>demo-app<\/title>/);
assert.ok(!html.includes("<title>zost</title>"), "title 没换掉");

const vite = await read("vite.config.ts");
assert.ok(
  vite.includes(`base: mode === "production" ? "/demo-app/" : "/"`),
  "vite base 没被参数化",
);
assert.ok(!vite.includes(`base: "/",`), "vite base 还是模板默认值");

const nginx = await read("deploy/nginx.conf.example");
assert.ok(!nginx.includes("<项目名>"), "nginx 里残留 <项目名> 占位");
assert.ok(nginx.includes("/srv/zost/demo-app/dist"), "nginx root 没换掉");

const readme = await read("README.md");
assert.match(readme, /^# demo-app$/m, "README 标题没换掉");
assert.ok(readme.includes("由 `zost-cli create` 生成"), "README 开头没换成生成说明");
assert.ok(!readme.includes("# zost 前端模板"), "README 还在自称模板");

// --- 排除项:构建产物不进生成结果,环境样例要进 ---
assert.ok(!existsSync(path.join(dir, "node_modules")), "node_modules 被拷进来了");
assert.ok(!existsSync(path.join(dir, "dist")), "dist 被拷进来了");
assert.ok(!existsSync(path.join(dir, ".env")), ".env 不该存在");
assert.ok(existsSync(path.join(dir, ".env.example")), ".env.example 必须在");

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

// --- 点文件兜底:npm 包无条件剔除 .gitignore/.npmrc(scaffold 内置常量补写) ---
const { DOTFILE_FALLBACK } = await import(
  pathToFileURL(path.join(root, "dist", "scaffold.js")).href
);
// 按 EOL 归一再比:autocrlf 的机器上新克隆,template/ 里是 CRLF 而常量是 LF
const norm = (s) => s.replace(/\r\n/g, "\n");
for (const [name, content] of Object.entries(DOTFILE_FALLBACK)) {
  assert.equal(
    norm(await readFile(path.join(root, "template", name), "utf8")),
    norm(content),
    `${name} 的兜底常量与 template/ 里的文件必须逐字相同 —— 改一处另一处也要改`,
  );
  assert.ok(existsSync(path.join(dir, name)), `生成结果缺 ${name}`);
}

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
const packed = spawnSync(
  process.execPath,
  [path.join(pkgRoot, "dist", "index.js"), "create", "packed-app"],
  { cwd: fromPack, encoding: "utf8" },
);
assert.equal(packed.status, 0, `从 npm 包里生成失败:\n${packed.stderr}`);
const pdir = path.join(fromPack, "packed-app");
for (const name of [".gitignore", ".npmrc", ".env.example", "package.json"]) {
  assert.ok(existsSync(path.join(pdir, name)), `registry 包生成的项目缺 ${name}`);
}
assert.ok(
  !existsSync(path.join(pdir, "node_modules")),
  "registry 包把 node_modules 拷进去了",
);
assert.match(
  await readFile(path.join(pdir, "package.json"), "utf8"),
  /"name": "packed-app"/,
);

console.log(
  `smoke OK —— 生成、替换、排除、守卫、点文件兜底、registry 包路径全部通过(${tmp})`,
);
