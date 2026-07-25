#!/usr/bin/env node
// uking-app —— U-King 小程序包的校验与打包工具。零运行时依赖。
//
//   uking-app validate <dir> [--json]      校验一个小程序包
//   uking-app pack <dir> [-o out.ukapp]    打成 .ukapp（tar.gz），校验不过就拒绝打包
//   uking-app info <dir> [--json]          摘要：动作、权限、面
//
// 退出码遵循 ActionParity CLI 剖面：0=通过  1=校验不通过  2=你调错了
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { validatePackage } from "../src/validate.mjs";

const argv = process.argv.slice(2);
const JSONOUT = argv.includes("--json");
const args = argv.filter((a) => a !== "--json");
const [cmd, dirArg] = args;

const die = (msg, code = 2) => {
  if (JSONOUT) console.log(JSON.stringify({ ok: false, error: msg }));
  else console.error(`错误: ${msg}`);
  process.exit(code);
};

const USAGE = `用法:
  uking-app validate <dir> [--json]
  uking-app pack <dir> [-o <out.ukapp>]
  uking-app info <dir> [--json]`;

if (!cmd || ["-h", "--help", "help"].includes(cmd)) { console.log(USAGE); process.exit(cmd ? 0 : 2); }
if (!dirArg) die(`${cmd} 需要一个目录参数\n${USAGE}`);
const dir = path.resolve(dirArg);
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`不是目录: ${dir}`);

// ───────────────────────── validate ─────────────────────────
function doValidate(quiet = false) {
  const r = validatePackage(dir);
  if (JSONOUT && !quiet) {
    console.log(JSON.stringify({ ok: r.ok, errors: r.errors, warnings: r.warnings, info: r.info }, null, 2));
    return r;
  }
  if (quiet) return r;
  const name = r.app?.app?.name ? `${r.app.app.name} (${r.app.app.id})` : path.basename(dir);
  console.log(`校验 ${name}`);
  for (const m of r.info) console.log(`  ℹ ${m}`);
  for (const m of r.warnings) console.log(`  ⚠ ${m}`);
  for (const m of r.errors) console.log(`  ✗ ${m}`);
  console.log(r.ok
    ? `\n✅ 通过${r.warnings.length ? `（${r.warnings.length} 条建议）` : ""}`
    : `\n❌ ${r.errors.length} 个问题`);
  return r;
}

// ───────────────────────── pack (tar.gz) ─────────────────────────
// 手写 USTAR：宿主首版只吃 tar.gz（flate2+tar 是它现成的依赖，久经沙场），
// zip 解析器等 fuzz 面评审过再上。mtime 固定为 0，保证同样的输入打出同样的字节。
function tarHeader(name, size, mode = 0o644, type = "0") {
  const h = Buffer.alloc(512);
  const put = (s, off, len) => Buffer.from(String(s)).copy(h, off, 0, Math.min(String(s).length, len));
  const oct = (n, off, len) => put(n.toString(8).padStart(len - 1, "0") + "\0", off, len);
  if (Buffer.byteLength(name) > 100) throw new Error(`路径太长（USTAR 限 100 字节）: ${name}`);
  put(name, 0, 100);
  oct(mode, 100, 8); oct(0, 108, 8); oct(0, 116, 8);
  oct(size, 124, 12); oct(0, 136, 12);
  h.write("        ", 148, 8, "ascii");     // 校验和先填空格
  put(type, 156, 1);
  put("ustar\0", 257, 6); put("00", 263, 2);
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return h;
}

function walk(root, base = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isSymbolicLink()) throw new Error(`包里不允许符号链接: ${rel}`);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      out.push({ rel, dir: true }, ...walk(root, rel));
    } else if (e.isFile()) out.push({ rel, dir: false });
  }
  return out;
}

function doPack() {
  const r = doValidate(true);
  if (!r.ok) { doValidate(); die("校验不通过，拒绝打包（先修上面的问题）", 1); }

  const oi = args.indexOf("-o");
  const out = path.resolve(oi >= 0 && args[oi + 1] ? args[oi + 1] : `${r.app.app.slug}-${r.app.app.version}.ukapp`);

  const chunks = [];
  let files = 0, bytes = 0;
  for (const e of walk(dir)) {
    if (e.dir) { chunks.push(tarHeader(e.rel + "/", 0, 0o755, "5")); continue; }
    const data = fs.readFileSync(path.join(dir, e.rel));
    chunks.push(tarHeader(e.rel, data.length), data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
    files++; bytes += data.length;
  }
  chunks.push(Buffer.alloc(1024)); // 两个空块 = 归档结束

  const gz = zlib.gzipSync(Buffer.concat(chunks), { level: 9 });
  fs.writeFileSync(out, gz);
  const msg = { ok: true, out, files, raw_bytes: bytes, packed_bytes: gz.length };
  if (JSONOUT) console.log(JSON.stringify(msg));
  else console.log(`✅ ${out}\n   ${files} 个文件 · ${(bytes / 1024).toFixed(0)}KB → ${(gz.length / 1024).toFixed(0)}KB`);
}

// ───────────────────────── info ─────────────────────────
function doInfo() {
  const r = validatePackage(dir);
  if (!r.app) die("读不出清单");
  const a = r.app, p = r.parity ?? {};
  const acts = (p.actions ?? []).map((x) => ({
    id: x.id, title: x.title, headless: !!x.execution?.headless,
    effect: x.effects?.class, risk: x.effects?.risk, confirmation: x.effects?.confirmation,
  }));
  if (JSONOUT) {
    console.log(JSON.stringify({ ok: r.ok, app: a.app, package: a.package, permissions: a.permissions,
      surfaces: p.surfaces, actions: acts }, null, 2));
    return;
  }
  console.log(`${a.app.name}  ${a.app.version}   ${a.app.id}`);
  if (a.app.summary) console.log(`  ${a.app.summary}`);
  console.log(`  形态: ${a.package.kind}   命名空间: app.${a.app.slug}.*   校验: ${r.ok ? "通过" : "不通过"}`);
  console.log(`  面: ${(p.surfaces ?? []).map((s) => `${s.id}(${s.kind})`).join("  ")}`);
  console.log(`  动作:`);
  for (const x of acts)
    console.log(`    ${x.id}\n      ${x.title}\n      ${x.effect}/${x.risk} 确认=${x.confirmation} 无头=${x.headless ? "是" : "否"}`);
  const perms = [];
  for (const [k, v] of Object.entries(a.permissions?.ai ?? {})) if (v === true) perms.push(`ai.${k}`);
  for (const [k, v] of Object.entries(a.permissions?.fs ?? {})) if (v === true) perms.push(`fs.${k}`);
  for (const h of a.permissions?.net?.allow ?? []) perms.push(`net:${h}`);
  for (const h of a.permissions?.host_actions ?? []) perms.push(`host:${h}`);
  console.log(`  权限: ${perms.length ? perms.join("  ") : "无（完全沙箱）"}`);
}

try {
  if (cmd === "validate") process.exit(doValidate().ok ? 0 : 1);
  else if (cmd === "pack") doPack();
  else if (cmd === "info") doInfo();
  else die(`不认识的命令 "${cmd}"\n${USAGE}`);
} catch (e) {
  die(e?.message ?? String(e));
}
