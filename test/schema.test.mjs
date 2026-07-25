// 校验器自测。零依赖，`node --test` 跑。
//
// 重点不是「合法的包能过」，而是「非法的包必须被拦下」——
// 一个只会说 OK 的校验器比没有校验器更危险。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePackage } from "../src/validate.mjs";
import { validate as jsv } from "../src/jsonschema.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// 把一个示例包复制到临时目录，施加一处破坏，返回校验结果
function mutated(example, mutate) {
  const src = path.join(REPO, "examples", example);
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), "ukapp-"));
  fs.cpSync(src, dst, { recursive: true });
  const app = read(path.join(dst, "uking-app.json"));
  const parity = read(path.join(dst, "action-parity.json"));
  mutate(app, parity, dst);
  fs.writeFileSync(path.join(dst, "uking-app.json"), JSON.stringify(app, null, 2));
  fs.writeFileSync(path.join(dst, "action-parity.json"), JSON.stringify(parity, null, 2));
  const r = validatePackage(dst);
  fs.rmSync(dst, { recursive: true, force: true });
  return r;
}

const hasErr = (r, needle) => r.errors.some((e) => e.includes(needle));

test("示例包本身必须通过", () => {
  for (const ex of ["hello", "imagefix"]) {
    const r = validatePackage(path.join(REPO, "examples", ex));
    assert.equal(r.ok, true, `${ex} 未通过:\n${r.errors.join("\n")}`);
  }
});

test("动作 ID 越出命名空间 → 拒绝", () => {
  const r = mutated("hello", (app, parity) => { parity.actions[0].id = "evil.take.over"; });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "命名空间"), r.errors.join("\n"));
});

test("身份不一致 → 拒绝", () => {
  const r = mutated("hello", (app) => { app.app.id = "org.example.app.somethingelse"; });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "身份不一致"), r.errors.join("\n"));
});

test("版本不一致 → 拒绝", () => {
  const r = mutated("hello", (app) => { app.app.version = "9.9.9"; });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "版本不一致"), r.errors.join("\n"));
});

test("声明 headless 却没有动作模块 → 拒绝（parity 的命门）", () => {
  const r = mutated("hello", (app) => { delete app.package.web.actions; });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "无头调用时没有实现可跑"), r.errors.join("\n"));
});

test("清单里的文件不存在 → 拒绝", () => {
  const r = mutated("hello", (app) => { app.package.web.entry = "nope.html"; });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "不存在"), r.errors.join("\n"));
});

test("quick_actions 引用了不存在的动作 → 拒绝", () => {
  const r = mutated("imagefix", (app) => { app.ui.quick_actions[0].action = "app.imagefix.ghost.act"; });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "不存在的动作"), r.errors.join("\n"));
});

test("动作没绑定到任何 GUI 面 → 拒绝（没人能点）", () => {
  const r = mutated("hello", (app, parity) => {
    parity.actions[0].bindings = parity.actions[0].bindings.filter((b) => b.surface !== "miniapp");
  });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "kind=gui"), r.errors.join("\n"));
});

test("绑定到未声明的 surface → 拒绝", () => {
  const r = mutated("hello", (app, parity) => { parity.actions[0].bindings[0].surface = "ghost"; });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "未声明的 surface"), r.errors.join("\n"));
});

test("slug 含下划线 → 拒绝（会撞 MCP 工具名）", () => {
  const r = mutated("hello", (app, parity) => {
    app.app.slug = "he_llo";
    parity.actions[0].id = "app.he_llo.greet.say";
    for (const b of parity.actions[0].bindings) b.target = b.target.replace("app.hello", "app.he_llo");
  });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "uking-app.json.app.slug"), r.errors.join("\n"));
});

test("profile 常量写错 → 拒绝", () => {
  const r = mutated("hello", (app) => { app.profile = "action-parity/miniapp@0.2"; });
  assert.equal(r.ok, false);
});

test("host_actions 里混入小程序动作 → 拒绝", () => {
  const r = mutated("hello", (app) => { app.permissions = { host_actions: ["app.other.do.thing"] }; });
  assert.equal(r.ok, false);
  assert.ok(hasErr(r, "只填宿主动作"), r.errors.join("\n"));
});

// ── 子集校验器自身 ──
test("jsonschema 子集：const / pattern / additionalProperties / required", () => {
  const s = {
    type: "object", additionalProperties: false, required: ["a"],
    properties: { a: { const: 1 }, b: { type: "string", pattern: "^x" } },
  };
  assert.equal(jsv({ a: 1 }, s).length, 0);
  assert.ok(jsv({ a: 2 }, s).length > 0, "const 应拦下");
  assert.ok(jsv({}, s).length > 0, "required 应拦下");
  assert.ok(jsv({ a: 1, z: 1 }, s).length > 0, "additionalProperties 应拦下");
  assert.ok(jsv({ a: 1, b: "yz" }, s).length > 0, "pattern 应拦下");
});

test("jsonschema 子集：if/then 按 package.kind 生效", () => {
  const s = {
    type: "object",
    properties: { kind: { enum: ["web", "native"] }, web: { type: "object" } },
    allOf: [{ if: { properties: { kind: { const: "web" } }, required: ["kind"] }, then: { required: ["web"] } }],
  };
  assert.equal(jsv({ kind: "native" }, s).length, 0, "非 web 不该要求 web 块");
  assert.ok(jsv({ kind: "web" }, s).length > 0, "web 却缺 web 块，应拦下");
  assert.equal(jsv({ kind: "web", web: {} }, s).length, 0);
});
