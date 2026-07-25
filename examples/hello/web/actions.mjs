// 动作实现 —— 这是这个小程序的「核」。
//
// 铁律：这个文件里不许出现 DOM、fetch、fs、任何外部域名。
// 它同时被两处 import：
//   ① web/index.html —— 用户点按钮时（GUI 面）
//   ② 宿主的自带 Node —— `U-King.exe action run app.hello.greet.say` 时（CLI / MCP / 影核面）
// 一份实现供所有面使用，这就是 ActionParity 说的 parity：
// 不是「GUI 和 CLI 都能做这件事」，而是「它们做的是同一件事」。
//
// 每个导出函数的签名固定为 (input, ctx) => Promise<output>：
//   input —— 宿主已按 action-parity.json 的 input_schema 校验过
//   ctx   —— { uking, signal }，宿主注入的能力（本例一个都不用）

/** @param {{name: string}} input */
export async function greetSay(input) {
  const name = String(input?.name ?? "").trim();
  if (!name) throw new Error("invalid_input: name 不能为空");
  return { ok: true, message: `你好，${name}！` };
}

// 动作 id → 实现。宿主读这张表来分发。
// key 必须与 action-parity.json 里的 actions[].id 逐字一致 —— 宿主在安装时校验，对不上装不进去。
export default {
  "app.hello.greet.say": greetSay,
};
