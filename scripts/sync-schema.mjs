#!/usr/bin/env node
// 把上游 ActionParity schema 同步到 schema/vendor/ 作为**兜底缓存**。
//
// 为什么要有出处文件：同一份事实存在两个地方，就会在两个地方各自漂移。
// vendor 副本只在找不到上游时才被使用，且校验器会明确提示「这是缓存」。
// PROVENANCE.json 记录它是从哪、什么版本、什么 sha256 抄来的，方便判断有没有过期。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolveActionParitySchema } from "../src/validate.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = resolveActionParitySchema();

if (!r) {
  console.error("找不到上游 ActionParity schema。");
  console.error("设 ACTION_PARITY_SCHEMA=<path>，或把 action-parity 仓库放到本仓库同级目录。");
  process.exit(2);
}
if (r.cached) {
  console.error("只找到了缓存副本本身，没有上游可同步。");
  process.exit(2);
}

const buf = fs.readFileSync(r.path);
const j = JSON.parse(buf);
const dir = path.join(REPO, "schema", "vendor");
fs.mkdirSync(dir, { recursive: true });

const dest = path.join(dir, "action-parity.schema.json");
const before = fs.existsSync(dest) ? crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex") : null;
const after = crypto.createHash("sha256").update(buf).digest("hex");

fs.writeFileSync(dest, buf);
fs.writeFileSync(path.join(dir, "PROVENANCE.json"), JSON.stringify({
  note: "缓存副本，不是真相源。校验器优先使用上游；只有找不到上游时才退回这里，并会明确提示。",
  source_path_at_sync: r.path,
  upstream_id: j.$id,
  spec_version: j.properties?.spec_version?.const,
  sha256: after,
  resync: "npm run sync-schema",
}, null, 2) + "\n");

console.log(before === after
  ? `已是最新（spec_version=${j.properties?.spec_version?.const}）`
  : `已更新 vendor 副本：${before ? before.slice(0, 12) : "(无)"} → ${after.slice(0, 12)}  spec_version=${j.properties?.spec_version?.const}`);
