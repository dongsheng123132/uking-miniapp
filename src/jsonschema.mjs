// JSON Schema draft 2020-12 的一个够用子集 —— 零依赖，让 `npx uking-app validate` 不必先 npm i。
// 覆盖本仓库两份 schema 实际用到的全部关键字；遇到不认识的关键字直接忽略（不假装通过，也不误报）。
//
// 同一套判定之后要在 miniapp.rs 里用 Rust 重写一遍（宿主必须自己校验，不能信打包方），
// 所以这里刻意只用最朴素的结构，方便逐行照搬。

const typeOf = (v) =>
  v === null ? "null" : Array.isArray(v) ? "array"
  : Number.isInteger(v) ? "integer" : typeof v === "number" ? "number"
  : typeof v;

const matchesType = (v, t) =>
  Array.isArray(t) ? t.some((x) => matchesType(v, x))
  : t === "number" ? typeOf(v) === "number" || typeOf(v) === "integer"
  : typeOf(v) === t;

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref: ${ref}`);
  let cur = root;
  for (const seg of ref.slice(2).split("/")) {
    cur = cur?.[seg.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (cur === undefined) throw new Error(`$ref not found: ${ref}`);
  }
  return cur;
}

/** @returns {string[]} 错误列表，空数组 = 通过 */
export function validate(data, schema, root = schema, where = "") {
  const errs = [];
  const at = (p) => (where ? `${where}${p}` : p || "(root)");

  if (schema.$ref) return validate(data, resolveRef(root, schema.$ref), root, where);
  if (schema.const !== undefined && JSON.stringify(data) !== JSON.stringify(schema.const))
    errs.push(`${at("")}: 必须是 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(data)}`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(data)))
    errs.push(`${at("")}: 必须是 ${schema.enum.map((e) => JSON.stringify(e)).join(" | ")}，实际 ${JSON.stringify(data)}`);
  if (schema.type && !matchesType(data, schema.type)) {
    errs.push(`${at("")}: 类型应为 ${schema.type}，实际 ${typeOf(data)}`);
    return errs; // 类型都不对，后面的检查没意义
  }

  const t = typeOf(data);

  if (t === "string") {
    if (schema.minLength != null && data.length < schema.minLength)
      errs.push(`${at("")}: 至少 ${schema.minLength} 字，实际 ${data.length}`);
    if (schema.maxLength != null && data.length > schema.maxLength)
      errs.push(`${at("")}: 最多 ${schema.maxLength} 字，实际 ${data.length}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data))
      errs.push(`${at("")}: 不匹配 /${schema.pattern}/ —— ${JSON.stringify(data)}`);
  }

  if (t === "number" || t === "integer") {
    if (schema.minimum != null && data < schema.minimum) errs.push(`${at("")}: 不得小于 ${schema.minimum}`);
    if (schema.maximum != null && data > schema.maximum) errs.push(`${at("")}: 不得大于 ${schema.maximum}`);
    if (schema.exclusiveMinimum != null && data <= schema.exclusiveMinimum)
      errs.push(`${at("")}: 必须大于 ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum != null && data >= schema.exclusiveMaximum)
      errs.push(`${at("")}: 必须小于 ${schema.exclusiveMaximum}`);
  }

  if (t === "array") {
    if (schema.minItems != null && data.length < schema.minItems)
      errs.push(`${at("")}: 至少 ${schema.minItems} 项`);
    if (schema.maxItems != null && data.length > schema.maxItems)
      errs.push(`${at("")}: 最多 ${schema.maxItems} 项`);
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const it of data) {
        const k = JSON.stringify(it);
        if (seen.has(k)) { errs.push(`${at("")}: 存在重复项 ${k}`); break; }
        seen.add(k);
      }
    }
    if (schema.items) data.forEach((it, i) => errs.push(...validate(it, schema.items, root, `${at("")}[${i}]`)));
  }

  if (t === "object") {
    for (const k of schema.required ?? [])
      if (!(k in data)) errs.push(`${at("")}: 缺少必填字段 "${k}"`);
    if (schema.properties)
      for (const [k, sub] of Object.entries(schema.properties))
        if (k in data) errs.push(...validate(data[k], sub, root, `${at("")}.${k}`));
    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const k of Object.keys(data))
        if (!known.has(k)) errs.push(`${at("")}: 不认识的字段 "${k}"（该对象不允许额外字段）`);
    }
    if (schema.propertyNames)
      for (const k of Object.keys(data)) errs.push(...validate(k, schema.propertyNames, root, `${at("")} 的键名`));
  }

  for (const sub of schema.allOf ?? []) errs.push(...validate(data, sub, root, where));
  if (schema.if) {
    const ok = validate(data, schema.if, root, where).length === 0;
    const branch = ok ? schema.then : schema.else;
    if (branch) errs.push(...validate(data, branch, root, where));
  }
  if (schema.not && validate(data, schema.not, root, where).length === 0)
    errs.push(`${at("")}: 不应匹配 not 子句`);
  if (schema.anyOf && !schema.anyOf.some((s) => validate(data, s, root, where).length === 0))
    errs.push(`${at("")}: 不满足 anyOf 中的任何一支`);
  if (schema.oneOf) {
    const n = schema.oneOf.filter((s) => validate(data, s, root, where).length === 0).length;
    if (n !== 1) errs.push(`${at("")}: oneOf 应恰好匹配 1 支，实际匹配 ${n} 支`);
  }

  return errs;
}
