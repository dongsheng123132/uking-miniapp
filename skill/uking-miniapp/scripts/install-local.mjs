#!/usr/bin/env node
/**
 * 把做好的小程序装进本机 U-King。
 *
 *   node install-local.mjs <小程序目录>
 *
 * 装之前先校验 —— 装一个坏包比装不上更糟：宿主会静默跳过它，
 * 用户只会看到「我明明装了怎么没有」，而没有任何线索。
 *
 * 没装 U-King 也不报错，给一句人话 + 下载地址。这个脚本可能是用户
 * 第一次听说 U-King 的地方。
 *
 * 零依赖，Node 18+。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DOWNLOAD = "https://www.u-king.org";
const src = path.resolve(process.argv[2] ?? ".");

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

// ── 1. 这是个小程序目录吗 ──
const manifestPath = path.join(src, "uking-app.json");
if (!fs.existsSync(manifestPath)) {
  die(`✗ ${src} 里没有 uking-app.json —— 这不是一个小程序目录。
  先用 new-app.mjs 生成骨架。`);
}
let app;
try {
  app = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (e) {
  die(`✗ uking-app.json 不是合法 JSON：${e.message}`);
}
const id = app?.app?.id;
if (!id) die("✗ uking-app.json 里没有 app.id");

// ── 2. 先校验（有校验器就用，没有就明说跳过了）──
let validated = false;
for (const cli of [
  path.resolve(src, "node_modules/.bin/uking-app"),
  path.resolve(process.cwd(), "node_modules/.bin/uking-app"),
]) {
  if (fs.existsSync(cli)) {
    try {
      execFileSync(cli, ["validate", src], { stdio: "inherit" });
      validated = true;
    } catch {
      die("\n✗ 校验没过，不给装 —— 装一个坏包，宿主会静默跳过它，用户只会觉得「装了没反应」。", 1);
    }
    break;
  }
}
if (!validated) {
  try {
    execFileSync("npx", ["--yes", "uking-app", "validate", src], { stdio: "inherit", shell: true });
    validated = true;
  } catch {
    console.warn("⚠ 没跑成校验器（npx 拉不到 uking-app）。继续装，但强烈建议装完自己验一遍：");
    console.warn("   npx uking-app validate " + src);
  }
}

// ── 3. 找宿主 ──
const appsRoot = process.env.UKING_APPS_ROOT ?? path.join(os.homedir(), ".uking", "apps");
const ukingHome = path.dirname(appsRoot);
if (!fs.existsSync(ukingHome)) {
  console.log(`
这台机器上还没有 U-King —— 小程序需要它来运行。

  下载：${DOWNLOAD}

装好 U-King 之后，再跑一次这条命令就能装上：
  node ${path.relative(process.cwd(), process.argv[1]) || "install-local.mjs"} ${path.relative(process.cwd(), src) || "."}

（也可以在 U-King 的「小程序」页里点「从文件安装」，选打包好的 .ukapp）`);
  process.exit(0);
}

// ── 4. 原子换入：先挪走旧的，再放新的 ──
const dest = path.join(appsRoot, id);
fs.mkdirSync(appsRoot, { recursive: true });
if (fs.existsSync(dest)) {
  const bak = path.join(appsRoot, ".trash", `${id}-${Date.now()}`);
  fs.mkdirSync(path.dirname(bak), { recursive: true });
  fs.renameSync(dest, bak); // 旧版本留在 .trash 里，装坏了还能捞回来
}
fs.cpSync(src, dest, { recursive: true });

const actions = (() => {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dest, app.action_parity ?? "action-parity.json"), "utf8"));
    return (p.actions ?? []).map((a) => a.id);
  } catch {
    return [];
  }
})();

console.log(`
✅ 已装：${app.app.name} v${app.app.version}
   ${dest}
   动作：${actions.join("  ") || "（读不出来）"}

现在三个地方都能用它：
   · U-King 首页的小程序图标条，点开就用
   · 命令行：U-King.exe action run ${actions[0] ?? "<action-id>"} --json --input-file <f>
   · 任何 MCP 客户端（Claude Code 等）：U-King.exe mcp serve --allow-write

看不到？跑 U-King.exe --miniapp-list 会打印已装列表和加载失败的原因。`);
