// 小程序包校验：两份 schema + 跨文件一致性规则。
//
// 跨文件规则才是本文件的价值所在。schema 只能保证每份文件自己合法，
// 保证不了「uking-app.json 引用的动作真的存在」这类事 —— 而漂移正是从这种地方开始的。
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validate as jsv } from "./jsonschema.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

/**
 * 定位上游 ActionParity schema。
 * 单一真相源是上游仓库；我们只在找不到时退回本地缓存，并明确说这是缓存。
 */
export function resolveActionParitySchema() {
  const candidates = [
    process.env.ACTION_PARITY_SCHEMA,
    path.join(REPO, "node_modules", "action-parity", "schema", "action-parity.schema.json"),
    path.resolve(REPO, "..", "action-parity", "schema", "action-parity.schema.json"),
    path.resolve(REPO, "..", "cli+gui兼容的ai时代的软件开放框架", "schema", "action-parity.schema.json"),
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return { path: p, cached: false }; } catch {}
  }
  const fallback = path.join(REPO, "schema", "vendor", "action-parity.schema.json");
  if (fs.existsSync(fallback)) return { path: fallback, cached: true };
  return null;
}

/**
 * 上游 ActionParity 还带一批**语义 lint**（超时过长、报进度却不可取消……），
 * 那些规则不在 schema 里。我们不重抄一遍 —— 抄一遍就会漂移一遍 —— 而是直接转调它。
 * 找不到上游 CLI 就安静跳过：那不是包作者的错。
 */
function upstreamLint(parityPath, schemaPath) {
  if (!schemaPath) return null;
  const cli = path.resolve(path.dirname(schemaPath), "..", "bin", "action-parity.mjs");
  if (!fs.existsSync(cli)) return null;
  const r = spawnSync(process.execPath, [cli, "validate", parityPath], { encoding: "utf8" });
  const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(WARNING|ERROR)\t([^\t]+)\t([^\t]*)\t(.+)$/);
    if (m) out.push({ level: m[1], rule: m[2], at: m[3], message: m[4] });
  }
  return { cli, findings: out, status: r.status };
}

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/**
 * @param {string} dir 小程序包目录（含 uking-app.json）
 * @returns {{ok:boolean, errors:string[], warnings:string[], info:string[], app?:object, parity?:object}}
 */
export function validatePackage(dir) {
  const errors = [], warnings = [], info = [];
  const fail = (m) => (errors.push(m), { ok: false, errors, warnings, info });

  const appPath = path.join(dir, "uking-app.json");
  if (!fs.existsSync(appPath)) return fail(`找不到 ${appPath}`);

  let app;
  try { app = readJSON(appPath); } catch (e) { return fail(`uking-app.json 不是合法 JSON: ${e.message}`); }

  // ── 1. uking-app.json 对 schema ──
  const appSchema = readJSON(path.join(REPO, "schema", "uking-app.schema.json"));
  errors.push(...jsv(app, appSchema, appSchema, "uking-app.json"));
  if (errors.length) return { ok: false, errors, warnings, info };

  // ── 2. action-parity.json 对上游 schema ──
  const rel = app.action_parity ?? "./action-parity.json";
  const parityPath = path.join(dir, rel);
  if (!fs.existsSync(parityPath)) return fail(`找不到 ActionParity 清单: ${parityPath}`);
  let parity;
  try { parity = readJSON(parityPath); } catch (e) { return fail(`${rel} 不是合法 JSON: ${e.message}`); }

  const apSchema = resolveActionParitySchema();
  if (!apSchema) {
    warnings.push("找不到 ActionParity schema，跳过了标准符合性校验。装一下上游或设 ACTION_PARITY_SCHEMA=<path>。");
  } else {
    info.push(`ActionParity schema: ${apSchema.path}${apSchema.cached ? "  ⚠ 本地缓存副本，可能落后于上游" : ""}`);
    const s = readJSON(apSchema.path);
    errors.push(...jsv(parity, s, s, path.basename(parityPath)));

    const lint = upstreamLint(parityPath, apSchema.path);
    if (lint?.findings.length) {
      for (const f of lint.findings) {
        const m = `[ActionParity/${f.rule}] ${f.at} ${f.message}`;
        (f.level === "ERROR" ? errors : warnings).push(m);
      }
    } else if (!lint) {
      info.push("上游 action-parity CLI 不可达，跳过了语义 lint（超时/可取消性等）。");
    }
  }

  // ── 3. 跨文件一致性 ──
  const slug = app.app.slug;
  const prefix = `app.${slug}.`;
  const ids = (parity.actions ?? []).map((a) => a.id);
  const surfaceIds = new Set((parity.surfaces ?? []).map((s) => s.id));
  const guiSurfaces = new Set((parity.surfaces ?? []).filter((s) => s.kind === "gui").map((s) => s.id));

  if (app.app.id !== parity.application?.id)
    errors.push(`身份不一致: uking-app.json app.id="${app.app.id}" 而 ${rel} application.id="${parity.application?.id}"`);
  if (app.app.version !== parity.application?.version)
    errors.push(`版本不一致: uking-app.json app.version="${app.app.version}" 而 ${rel} application.version="${parity.application?.version}"`);

  const dupA = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dupA.length) errors.push(`动作 id 重复: ${[...new Set(dupA)].join(", ")}`);

  for (const id of ids) {
    if (!id.startsWith(prefix))
      errors.push(`动作 "${id}" 不在命名空间内 —— 必须以 "${prefix}" 开头（由 app.slug 决定）`);
    else if (id.slice(prefix.length).split(".").filter(Boolean).length < 2)
      errors.push(`动作 "${id}" 应形如 ${prefix}<域>.<动词>，至少还要两段`);
  }

  // MCP 工具名映射（点 → 下划线）后不得撞车
  const mcp = new Map();
  for (const id of ids) {
    const n = id.replace(/\./g, "_");
    if (mcp.has(n)) errors.push(`动作 "${id}" 与 "${mcp.get(n)}" 映射成同一个 MCP 工具名 "${n}"`);
    mcp.set(n, id);
  }

  for (const a of parity.actions ?? []) {
    for (const b of a.bindings ?? [])
      if (!surfaceIds.has(b.surface))
        errors.push(`动作 "${a.id}" 绑定到未声明的 surface "${b.surface}"`);
    if (!(a.bindings ?? []).some((b) => guiSurfaces.has(b.surface)))
      errors.push(`动作 "${a.id}" 没有绑定到任何 kind=gui 的 surface —— 小程序必须有人能点`);
    if (a.execution?.headless === true && !(a.bindings ?? []).some((b) => {
      const s = (parity.surfaces ?? []).find((x) => x.id === b.surface);
      return s && (s.kind === "cli" || s.kind === "mcp" || s.kind === "api");
    })) warnings.push(`动作 "${a.id}" 声明了 headless，但没绑定到 cli/mcp/api 面 —— AI 调不到它`);
  }

  const idSet = new Set(ids);
  for (const q of app.ui?.quick_actions ?? [])
    if (!idSet.has(q.action)) errors.push(`ui.quick_actions 引用了不存在的动作 "${q.action}"`);
  for (const h of app.permissions?.host_actions ?? [])
    if (h.startsWith("app.")) errors.push(`permissions.host_actions 里的 "${h}" 看着像小程序动作 —— 这里只填宿主动作`);

  // ── 4. 无头实现必须存在（这是 parity 不沦为口号的关键）──
  const anyHeadless = (parity.actions ?? []).some((a) => a.execution?.headless === true);
  const kind = app.package.kind;
  if (anyHeadless) {
    if (kind === "web" && !app.package.web?.actions)
      errors.push(`有动作声明 execution.headless=true，但 package.web.actions 没填 —— 无头调用时没有实现可跑。要么补上动作模块，要么把 headless 改成 false 并写 parity_exceptions。`);
    if (kind === "script" && !app.package.script?.entry)
      errors.push(`有动作声明 execution.headless=true，但 package.script.entry 没填。`);
  }

  // ── 5. 文件真的在盘上吗 ──
  const must = [];
  if (kind === "web") {
    const root = path.join(dir, app.package.web.root);
    must.push([path.join(root, app.package.web.entry), "package.web.entry"]);
    if (app.package.web.actions) must.push([path.join(root, app.package.web.actions), "package.web.actions"]);
  } else if (kind === "script") {
    must.push([path.join(dir, app.package.script.skill_dir), "package.script.skill_dir"]);
    if (app.package.script.entry)
      must.push([path.join(dir, app.package.script.skill_dir, app.package.script.entry), "package.script.entry"]);
  } else if (kind === "native") {
    must.push([path.join(dir, app.package.native.exe), "package.native.exe"]);
    if (!app.package.native.sha256)
      warnings.push("package.native.sha256 没填 —— 宿主无法校验这个 exe 没被掉包，分发前务必补上。");
  }
  const icon = app.ui.icon;
  if (!icon.startsWith("lucide:")) must.push([path.join(dir, icon), "ui.icon"]);
  for (const [p, label] of must)
    if (!fs.existsSync(p)) errors.push(`${label} 指向的文件不存在: ${path.relative(dir, p)}`);

  // ── 6. 建议 ──
  if (!app.app.min_host_version) warnings.push("建议填 app.min_host_version，否则老版本宿主会装上它然后炸掉。");
  if (!app.app.summary) warnings.push("建议填 app.summary，它是图标下面那行字。");
  if (kind === "native" && !app.package.native.platforms?.length)
    warnings.push("native 包建议声明 platforms。");
  const ai = app.permissions?.ai ?? {};
  if ((ai.image_edit || ai.image_generate || ai.chat || ai.video_generate) && !ai.max_calls_per_run)
    info.push("permissions.ai.max_calls_per_run 未填，宿主按默认 4 次/轮 封顶。");

  return { ok: errors.length === 0, errors, warnings, info, app, parity };
}
