# 做你的第一个小程序

四个文件，二十分钟，做出一个**人能点、AI 也能调**的小工具。

成品就是本仓库的 [`examples/resize`](../examples/resize)：拖进一张图，填个最大宽高，一键缩好保存。纯本地计算，不联网、不花额度。教程里的每一行代码都在 CI 里被校验，不会给你贴一段跑不起来的。

> 读之前不需要看完规范。真要查细节时再翻 [规范正文](../profiles/miniapp-0.1.md)。

---

## 0. 准备

需要 Node 18+，别的不需要（校验器零运行时依赖）。

```bash
git clone https://github.com/dongsheng123132/uking-miniapp
cd uking-miniapp
npx uking-app info examples/hello     # 先看看最小的样板长什么样
```

---

## 1. 四个文件

```
resize/
  uking-app.json        长什么样、怎么装、准许它碰什么
  action-parity.json    它能做什么             ← 这份是标准的，不是我们的
  web/
    index.html          界面
    actions.mjs         干活的                 ← 关键
```

**为什么是两份清单？** 因为 `action-parity.json` 属于 ActionParity 标准，它的 schema 是封闭的，塞不进 `ui`/`permissions` 这些 U-King 特有的东西。分开之后，你的 `action-parity.json` 能原样通过官方校验器 —— 这意味着你写的小程序天然是一个合规的 ActionParity 应用，哪怕你根本没打算管这件事。

---

## 2. 先想清楚：这个小程序能做什么

不是先画界面，是先定动作。动作是契约，界面只是它的一个入口。

编辑 `action-parity.json`，核心就是 `actions` 数组里这一项：

```jsonc
{
  "id": "app.resize.image.fit",          // app.<slug>.<域>.<动词>，命名空间是强制的
  "title": "Resize an image to fit a box",
  "description": "……",                    // 写给 AI 看的：它靠这句话决定要不要调你
  "input_schema": {
    "type": "object",
    "additionalProperties": false,        // 加上它，宿主才会拦下拼错的字段
    "required": ["image", "max_w", "max_h"],
    "properties": {
      "image": { "type": "string" },
      "max_w": { "type": "integer", "minimum": 1, "maximum": 8192 },
      "max_h": { "type": "integer", "minimum": 1, "maximum": 8192 }
    }
  },
  "output_schema": { /* … */ },
  "effects":   { "class": "read", "risk": "low", "reversible": true,
                 "confirmation": "never", "audit_required": false },
  "execution": { "headless": true, "idempotent": true,
                 "cancellable": false, "timeout_ms": 30000 },
  "bindings": [
    { "surface": "miniapp", "target": "uking-rpc:action/app.resize.image.fit" },
    { "surface": "cli",     "target": "cli:action run app.resize.image.fit --json --input-file <f>" }
  ]
}
```

三个字段值得多花点心思，它们不是形式主义：

| 字段 | 为什么重要 |
|---|---|
| `description` | **AI 靠它决定要不要调你。** 写「Resize an image」不如写清楚「等比缩放、不放大、产出交产出箱」——含糊的描述换来的是乱调 |
| `input_schema` | **宿主会真的按它校验，副作用之前就拦。** agent 会瞎试，这是唯一的护栏。`additionalProperties: false` 尤其值得加 |
| `effects` | 花钱的、发送的、不可逆的动作要如实标 `class` 和 `confirmation`。宿主和影子的确认流程直接读它 |

---

## 3. 写动作：`web/actions.mjs`

**这个文件不许碰 DOM、`fetch`、`fs` 或任何外部域名。**

不是洁癖 —— 它要被两处 import：你的界面（浏览器里）和宿主的 Node（无头调用时）。碰了 DOM，无头那条路直接崩。

```js
export async function imageFit(input, ctx) {
  const { uking } = ctx;
  const src = await uking.image.decode(input.image);

  // 等比缩放因子。取两个方向里更紧的那个，才不会有一边溢出。
  let k = Math.min(input.max_w / src.w, input.max_h / src.h);

  // 默认不放大：把小图拉大只会得到一个更大、更糊的文件。
  // 用户真要放大就显式说，别替他做这个决定。
  if (k > 1 && !input.allow_upscale) k = 1;

  const w = Math.max(1, Math.round(src.w * k));
  const h = Math.max(1, Math.round(src.h * k));
  const out = (w === src.w && h === src.h) ? src : await uking.image.resize(src.id, w, h);

  const message = `${src.w}×${src.h} → ${w}×${h}`;
  const artifact = await uking.artifact.emit({
    kind: "image",
    data: await uking.image.encode(out.id, "png"),
    action: "app.resize.image.fit",
    message,
  });

  return { ok: true, artifact, message, from: { w: src.w, h: src.h }, to: { w, h } };
}

// 动作 id → 实现。key 必须与 action-parity.json 里的 id 逐字一致。
export default { "app.resize.image.fit": imageFit };
```

注意最后返回的是 **`artifact` 引用，不是图片本身**。原因：同一个动作会被终端里的 agent 调用，那边只能消化文本。返回 `data:image/png;base64,...` 是几 MB 乱码，用户看不见，agent 的上下文还被白白吃掉。

你能用的宿主能力（`ctx.uking` / `window.uking`，两边一模一样）：

```
uking.image.*          解码 / 裁剪 / 缩放 / 合成 / 统计 / 编码
uking.ai.*             生图 / 改图 / 对话（要在 permissions 里申请）
uking.file.save/open   原生对话框，路径由用户选
uking.storage.*        自己的沙箱
uking.artifact.emit    交成品
uking.ui.toast/progress
```

**`uking` 上没有通用 `fetch`。** 所有 AI 调用在宿主进程里完成，你永远拿不到 API Key —— 这是设计，不是限制。

---

## 4. 写界面：`web/index.html`

界面只做三件事：收集输入、调动作、展示结果。**业务逻辑一行都不该在这儿。**

```html
<script type="module">
const r = await window.uking.action("app.resize.image.fit", {
  image: dataUrl,
  max_w: Number(document.getElementById("w").value),
  max_h: Number(document.getElementById("h").value),
});
// 动作返回引用，取图走 artifact 地址
document.querySelector("img").src = `uking://localhost/artifact/${r.artifact.id}`;
</script>
```

两个容易踩的点：

- **不要写 `<script src="bridge.js">`。** 宿主返回页面时会自动注入桥，`window.uking` 一定存在。
- **不要直接 import `actions.mjs` 自己跑。** 走 `window.uking.action()` 才会过入参校验、权限检查和事件记账 —— 也就是说界面这一面和 CLI 那一面走的是**同一道闸门**。绕过去，两个面就开始漂移了。

---

## 5. 校验

```bash
npx uking-app validate examples/resize
```

它同时跑三件事：我们的剖面规则、跨文件一致性（清单里引用的动作真的存在吗、文件真的在盘上吗）、以及**上游 ActionParity 的语义 lint**。最后一项经常能抓到人想不到的问题，比如「你报了进度却不让取消」。

看摘要：

```bash
npx uking-app info examples/resize
```

---

## 6. 两个面都验一遍 ← 别跳过这步

这是整个教程最重要的一步。

```bash
# 界面这一面：装进 U-King 点一下
# 无头这一面：
U-King.exe action run app.resize.image.fit --json --input-file in.json
```

`in.json` 长这样：

```json
{ "image": "C:/path/to/photo.png", "max_w": 800, "max_h": 800 }
```

**如果 GUI 能跑而这条命令不能，你的小程序就是坏的** —— 哪怕界面上一切正常。这正是 `actions.mjs` 必须 DOM-free 的原因，也是为什么值得单独跑一遍。

> Windows 上用 `--input-file` 而不是 `--input`：图片 data URL 动辄几 MB，远超命令行 32KB 上限。

顺手也验一下入参护栏真的在：

```bash
U-King.exe action run app.resize.image.fit --json --input '{"max_w":800}'
# → {"ok":false,"error":"invalid_input: 缺少必填字段 input.image"}   退出码 2
```

---

## 7. 打包分发

```bash
npx uking-app pack examples/resize -o 改尺寸.ukapp
```

校验不过它会**拒绝打包**。产物是个 tar.gz，别人双击或拖进 U-King 的小程序页就能装。

想上架就往任意 HTTPS 上放一个静态 JSON（[feed schema](../schema/uking-app-registry.schema.json)）—— 没有中心市场，也不需要审批。

---

## 8. 常见坑

| 症状 | 原因 |
|---|---|
| 装不进去，说「命名空间」 | 动作 id 必须以 `app.<你的slug>.` 开头，且后面至少两段 |
| 装不进去，说「需要 U-King x.y.z」 | `min_host_version` 比宿主新 |
| 校验说「无头调用时没有实现可跑」 | 声明了 `headless: true` 却没填 `package.web.actions` |
| GUI 好好的，CLI 报错 | `actions.mjs` 里混进了 DOM / `fetch` / `fs` |
| 动作返回成功，图却没变 | 用了 `fillRect`/`drawText` 的返回值当新句柄 —— 它们是**就地修改**，继续用原句柄 |
| slug 里带下划线被拒 | 下划线会和 MCP 工具名映射撞车，只允许小写字母/数字/连字符 |
| AI 调用报 `permission_denied` | `permissions.ai.*` 里没申请 |

---

## 9. 接下来

- **让 AI 帮你写。** U-King 的「AI 专家 → 小程序工程师」能按一句话需求生成骨架，你只改业务那几行。
- **申请 AI 能力。** 在 `permissions.ai` 里打开 `image_edit` 之类，就能在动作里调 `uking.ai.imageEdit()`。参考 [`examples/imagefix`](../examples/imagefix)，那是个真实的去水印/改字小程序。
- **读规范。** 真正想吃透的话，[§8 无头执行](../profiles/miniapp-0.1.md) 和 [§10 权限](../profiles/miniapp-0.1.md) 这两节值得读。

---

*English version of this guide is not written yet. Contributions welcome.*
