#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { scaffold } from "./scaffold.js";

/** npm 包名 = 目录名 = 部署子路径,所以三者共用一套字符集(小写、URL 安全)。 */
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const MAX_NAME = 100;

function validateName(name: string): string | null {
  if (!name) return "项目名不能为空";
  if (name.length > MAX_NAME) return `项目名太长(≤${MAX_NAME} 字符)`;
  if (!NAME_RE.test(name)) {
    return "项目名只允许小写字母 / 数字 / . _ -,且以字母或数字开头";
  }
  return null;
}

async function version(): Promise<string> {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return pkg.version;
}

const USAGE = `用法:
  zost-cli create <项目名>   从 template/ 生成新项目
  zost-cli create            不带名字则交互询问

选项:
  -h, --help     显示本帮助
  -v, --version  显示版本`;

async function promptName(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (
        await rl.question("项目名(目录名 / npm 包名 / 部署子路径): ")
      ).trim();
      const err = validateName(answer);
      if (!err) return answer;
      console.log(`无效:${err}`);
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === "-h" || cmd === "--help" || cmd === "help" || !cmd) {
    console.log(USAGE);
    return;
  }
  if (cmd === "-v" || cmd === "--version") {
    console.log(await version());
    return;
  }
  if (cmd !== "create") {
    throw new Error(`未知命令:${cmd}\n\n${USAGE}`);
  }

  const name = rest[0] ? rest[0].trim() : await promptName();
  const invalid = validateName(name);
  if (invalid) throw new Error(invalid);

  const target = path.resolve(process.cwd(), name);
  await scaffold(name, target);

  console.log(`已生成 ${target}
下一步:
  cd ${name}
  npm install
  npm run dev     # http://localhost:5173`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
