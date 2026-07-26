#!/usr/bin/env node
/**
 * 小程序脚手架 —— 一条命令吐出可校验的骨架。
 *
 *   node new-app.mjs --slug imagetag --name 图片打标 --summary "给图片批量加水印文字" [--kind web] [--ai] [--out <dir>]
 *
 * 为什么要脚手架而不是让 AI 凭空写三个文件：
 * 两份清单之间有一堆硬约束（id/version 必须一致、动作 ID 必须落在命名空间里、
 * headless 必须有实现、文件必须真实存在）。让 AI 每次重新推导这些，它会漏，
 * 而且漏了要到安装时才报错。骨架先把这些钉死，AI 只填业务。
 *
 * 零依赖，Node 18+。
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d = null) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const has = (k) => args.includes(`--${k}`);

const slug = opt("slug");
const name = opt("name");
if (!slug || !name) {
  console.error(`用法: node new-app.mjs --slug <英文短名> --name <中文名> [--summary <一句话>] [--ai] [--out <目录>]

  --slug     动作命名空间，只允许小写字母/数字/连字符，2-24 字符，禁下划线
  --name     显示名，最多 24 字
  --summary  图标下面那行字，最多 60 字
  --ai       申请 AI 改图权限（不加就是纯本地小程序，不联网不花额度）
  --out      输出目录，默认 ./<slug>`);
  process.exit(2);
}
if (!/^[a-z][a-z0-9-]{1,23}$/.test(slug)) {
  console.error(`✗ slug "${slug}" 非法：只允许小写字母/数字/连字符，2-24 字符，禁下划线`);
  console.error("  （下划线会和 MCP 工具名映射撞车，所以规范里禁掉了）");
  process.exit(2);
}

const summary = opt("summary", "");
const wantAi = has("ai");
const out = path.resolve(opt("out", `./${slug}`));
const id = `org.uking.app.${slug}`;
const actionId = `app.${slug}.do.run`;
const SPEC_VERSION = "0.5.0";

if (fs.existsSync(out) && fs.readdirSync(out).length) {
  console.error(`✗ ${out} 已存在且非空`);
  process.exit(2);
}

// ── action-parity.json：能力的唯一真相源 ──
const parity = {
  $schema: `https://raw.githubusercontent.com/dongsheng123132/action-parity/v${SPEC_VERSION}/schema/action-parity.schema.json`,
  spec_version: SPEC_VERSION,
  application: { id, name, version: "0.1.0", description: summary || `${name} —— a U-King MiniApp.` },
  conformance_targets: ["AP-1"],
  surfaces: [
    { id: "miniapp", kind: "gui", required_for_parity: true, reachability: "in-process", description: "The mini-app window." },
    { id: "cli", kind: "cli", required_for_parity: true, reachability: "external", description: `U-King.exe action run ${actionId} --json --input-file <f>` },
  ],
  actions: [
    {
      id: actionId,
      // ⚠️ AI 靠 title/description 决定要不要调你 —— 这两行是排名信号，不是文档
      title: `TODO: what ${name} does, in one line`,
      description: "TODO: 写清楚它吃什么、吐什么、什么时候该用它。含糊的描述换来的是被乱调。",
      tags: [],
      input_schema: {
        type: "object",
        additionalProperties: false, // 加上它，宿主才会拦下拼错的字段
        required: ["image"],
        properties: {
          image: { type: "string", description: "data: URL 或本地绝对路径" },
        },
      },
      output_schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok", "artifact", "message"],
        properties: {
          ok: { type: "boolean" },
          artifact: {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind", "path"],
            properties: {
              id: { type: "string" }, kind: { const: "image" },
              w: { type: "integer" }, h: { type: "integer" },
              bytes: { type: "integer" }, path: { type: "string" },
            },
          },
          message: { type: "string", maxLength: 200 },
        },
      },
      effects: {
        class: wantAi ? "external" : "read",
        risk: "low",
        reversible: true,
        confirmation: "never",
        audit_required: false,
        notes: wantAi ? "调付费模型，消耗额度。" : "纯本地计算，不联网不花额度。",
      },
      execution: {
        headless: true,
        idempotent: !wantAi,
        cancellable: false,
        timeout_ms: wantAi ? 600000 : 30000,
        // ⚠️ 只有真跑过才填这行。填一个没跑过的命令＝新造一条作弊路径
        headless_evidence: `U-King.exe action run ${actionId} --json --no-input --input-file <f>`,
      },
      bindings: [
        { surface: "miniapp", target: `uking-rpc:action/${actionId}` },
        { surface: "cli", target: `cli:action run ${actionId} --json --no-input --input-file <f>` },
      ],
    },
  ],
};

// ── uking-app.json：长什么样、怎么装、准许它碰什么 ──
const app = {
  $schema: "https://raw.githubusercontent.com/dongsheng123132/uking-miniapp/v0.1.0/schema/uking-app.schema.json",
  profile: "action-parity/miniapp@0.1",
  app: {
    id, slug, name, version: "0.1.0",
    ...(summary ? { summary } : {}),
    license: "Apache-2.0",
    locales: ["zh-CN"],
    min_host_version: "0.9.70",
  },
  action_parity: "./action-parity.json",
  package: { kind: "web", web: { root: "web", entry: "index.html", actions: "actions.mjs" } },
  ui: {
    icon: "lucide:sparkles",
    accent: "#7c5cff",
    container: "embed",
    home_dock: true,
    quick_actions: [{ action: actionId, label: name.slice(0, 6) }],
  },
  permissions: {
    ...(wantAi ? { ai: { image_edit: true, max_calls_per_run: 3 } } : {}),
    fs: { app_data: true, save_dialog: true, open_dialog: true },
  },
  market: { category: "image", price: wantAi ? "credits" : "free" },
};

const ACTIONS_MJS = `// ${name} —— 动作实现。
//
// 【铁律】这个文件不许出现 DOM、fetch、fs 或任何外部域名。
// 它被两处 import：web/index.html（界面）和宿主的 Node（AI 无头调用）。
// 碰了 DOM，无头那条路直接崩 —— 而那时界面看着还是好的，没人会发现。
//
// 能用的宿主能力（ctx.uking，和界面里的 window.uking 完全一致）：
//   uking.image.decode/crop/resize/encode/pixels/ringStats/fillRect/drawText/
//               compositeFeather/warpPerspective/clone
//   uking.ai.imageEdit/imageGen        （要先在 permissions.ai 里申请）
//   uking.file.save/open               （原生对话框，路径由用户选）
//   uking.storage.get/set              （自己的沙箱）
//   uking.artifact.emit                （交成品，返回引用）
//   uking.ui.toast/progress
//
// 注意 fillRect / drawText 是**就地修改**，返回原句柄；
// crop / resize / compositeFeather / warpPerspective 返回**新句柄**。

export async function run(input, ctx) {
  const { uking } = ctx;
  const src = await uking.image.decode(input.image);

  await uking.ui?.progress?.(40, "处理中");

  // TODO: 在这里写业务。下面是个占位：原样输出。
  const out = src;

  const message = \`已处理 · \${out.w}×\${out.h}\`;

  // 交产物、返回引用，不要把像素塞进返回值 ——
  // 同一个动作会被终端里的 agent 调用，那边只能消化文本，
  // 几 MB 的 base64 既看不见图，又白白撑爆它的上下文。
  const artifact = await uking.artifact.emit({
    kind: "image",
    data: await uking.image.encode(out.id, "png"),
    action: ${JSON.stringify(actionId)},
    message,
  });

  await uking.ui?.progress?.(100, "完成");
  return { ok: true, artifact, message };
}

export default { ${JSON.stringify(actionId)}: run };
`;

const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${name}</title>
<!--
  界面只做三件事：收集输入、调动作、展示结果。业务逻辑一行都不在这儿 —— 它在 actions.mjs。

  不要写 <script src="bridge.js">：宿主返回页面时会自动注入桥，window.uking 一定存在。
  不要直接 import actions.mjs 自己跑：走 window.uking.action() 才会过入参校验、
  权限检查和事件记账，也就是说界面这一面和 CLI 那一面走的是同一道闸门。
-->
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; padding:28px; background:#0f1115; color:#e6e8ec;
         font:14px/1.6 "Microsoft YaHei","PingFang SC",system-ui,sans-serif; }
  h1 { font-size:17px; margin:0 0 4px; }
  p.sub { margin:0 0 20px; color:#7b818d; font-size:12.5px; }
  #drop { border:1.5px dashed #2a2e36; border-radius:12px; padding:28px; text-align:center;
          color:#7b818d; cursor:pointer; }
  #drop:hover { border-color:${app.ui.accent}; }
  #drop img { max-width:100%; max-height:240px; border-radius:8px; }
  .row { display:flex; gap:8px; align-items:center; margin:16px 0; }
  button { border:0; border-radius:8px; padding:8px 18px; font:inherit; font-weight:600;
           background:${app.ui.accent}; color:#fff; cursor:pointer; }
  button.ghost { background:#1a1e24; color:#c9ced8; border:1px solid #2a2e36; font-weight:400; }
  button:disabled { opacity:.45; cursor:default; }
  #msg { font-size:12.5px; color:#8b909a; min-height:20px; }
  #msg.err { color:#fca5a5; }
</style>
</head>
<body>
  <h1>${name}</h1>
  <p class="sub">${summary || "TODO: 一句话说清楚它是干嘛的"}</p>
  <div id="drop">把图片拖进来，或点这里选一张</div>
  <div class="row">
    <button id="go" disabled>开始</button>
    <button class="ghost" id="save" disabled>保存</button>
  </div>
  <div id="msg"></div>

<script type="module">
const $ = (id) => document.getElementById(id);
let dataUrl = null;
const say = (t, cls = "") => { $("msg").textContent = t; $("msg").className = cls; };
function show(url) {
  dataUrl = url;
  $("drop").innerHTML = '<img src="' + url + '" alt="">';
  $("go").disabled = false; $("save").disabled = false;
}
$("drop").onclick = async () => {
  try { const f = await window.uking.file.open(["png","jpg","jpeg","webp"]); if (f) show(f.dataUrl); }
  catch (e) { say(e.message, "err"); }
};
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => show(r.result); r.readAsDataURL(f);
});
$("go").onclick = async () => {
  if (!dataUrl) return;
  $("go").disabled = true; say("处理中…");
  try {
    const r = await window.uking.action(${JSON.stringify(actionId)}, { image: dataUrl });
    // 动作返回引用，取图走 artifact 地址
    show("uking://localhost/artifact/" + r.artifact.id);
    say(r.message);
  } catch (e) { say(e?.message || String(e), "err"); }
  finally { $("go").disabled = false; }
};
$("save").onclick = async () => {
  try { const p = await window.uking.file.save("${slug}.png", dataUrl); say(p ? "已保存到 " + p : "已取消"); }
  catch (e) { say(e.message, "err"); }
};
</script>
</body>
</html>
`;

fs.mkdirSync(path.join(out, "web"), { recursive: true });
fs.writeFileSync(path.join(out, "action-parity.json"), JSON.stringify(parity, null, 2) + "\n");
fs.writeFileSync(path.join(out, "uking-app.json"), JSON.stringify(app, null, 2) + "\n");
fs.writeFileSync(path.join(out, "web", "actions.mjs"), ACTIONS_MJS);
fs.writeFileSync(path.join(out, "web", "index.html"), INDEX_HTML);

console.log(`✅ 骨架已生成：${out}

  action-parity.json   能力（动作 id 已钉成 ${actionId}）
  uking-app.json       展示 / 打包 / 权限${wantAi ? "（已申请 ai.image_edit）" : "（纯本地，无 AI 权限）"}
  web/actions.mjs      ← 业务写这里
  web/index.html       界面

接下来：
  1. 改 action-parity.json 里的 title / description —— AI 靠它决定要不要调你
  2. 按需要改 input_schema（宿主会真的按它校验，副作用之前就拦）
  3. 在 web/actions.mjs 的 TODO 处写业务
  4. 校验：  npx uking-app validate ${path.relative(process.cwd(), out) || "."}
  5. 装上：  node <skill>/scripts/install-local.mjs ${path.relative(process.cwd(), out) || "."}
`);
