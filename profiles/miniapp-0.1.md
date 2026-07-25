# U-King 小程序开放规范

**ActionParity MiniApp Profile 0.1** · 线缆标识 `action-parity/miniapp@0.1`

> 状态：**非规范性工作草案（non-normative working draft）**。
> 按 ActionParity 的既定做法，本剖面要等到**两个互相独立的产品**各自走完一遍接入闭环，才谈得上进入规范性文本。
> 目前只有 U-King 一家实现，所以：字段名可能变，`profile` 常量不会变。

---

## 1. 这份规范解决什么

客户要的往往不是「一个 AI 能力」，也不是「一个软件」，而是两者的合体：

> 打开一张图 → 拖框圈住水印 → 一键应用 → 保存。

拆开看，它是一段 skill（AI 怎么修图）加一个 GUI（怎么把框画出来）。分开做，两边都残废：光有 skill，普通用户不会用；光有 GUI，AI 调不动，也没法被自动化编排。

本规范把这种合体定义成一个可分发、可安装、可被人和 AI 同时使用的单元：

> **一个小程序 = 一份清单 + 一个 GUI 外壳 + 一组 ActionParity 动作。**

同一个单元，三种用法：

| 谁 | 怎么用 |
|---|---|
| 人 | 在 U-King 首页点图标，打开 GUI |
| AI（本机 agent / Claude Code / 任意 MCP 客户端） | `U-King.exe action run app.<slug>.<域>.<动词>`，或 MCP 工具调用 |
| 远端影子（手机等） | 影核 `sync.command`，`action_id` 就是同一个 |

三条路收敛到宿主里的同一个动作分发器。这不是「GUI 和 CLI 都实现了这件事」，而是「它们做的是同一件事」——差别很大，见 §8。

---

## 2. 术语

`MUST` / `MUST NOT` / `SHOULD` / `MAY` 按 RFC 2119 解释。

- **宿主（host）**：U-King 桌面应用。它安装、沙箱化并分发小程序的动作调用。
- **小程序（MiniApp）**：符合本剖面的可安装单元。
- **面（surface）**：ActionParity 术语。同一批动作的一种呈现方式（GUI、CLI、MCP……）。
- **动作模块（actions module）**：小程序里那个不碰 DOM 的 ES 模块，动作的唯一实现所在。

---

## 3. 与 ActionParity / 影核的关系

本剖面**不是**新协议。它是 ActionParity 0.1.0 的一个剖面，与影核（ShadowCore Profile，`action-parity/sync@0.1`）平级：

```
ActionParity 0.1.0  ── 动作 / 状态 / 事件 / 授权 的公共模型
        ├── ShadowCore Profile   一核多影：跨设备同步
        └── MiniApp Profile      一壳多用：可安装单元      ← 本文
```

因此：

- 小程序的动作**就是** ActionParity 动作，`action-parity.json` 原样通过上游校验器。
- 影核**不需要为小程序做任何改动**。影子发 `sync.command`，`action_id` 字段在 `action-parity-sync.schema.json` 里只要求非空字符串，带命名空间的 ID 原样通过。
- 装一个小程序 = 给这台设备的**动作面扩容**。影子重新拉一次 `action manifest` 就发现了新能力。
- 高风险动作的确认流程直接吃小程序自己清单里的 `effects.confirmation`，不另立一套。

---

## 4. 包的布局

```
<package>/
  uking-app.json        必需  展示 / 打包 / 权限          ← 本规范定义
  action-parity.json    必需  身份 / 面 / 动作            ← ActionParity 0.1.0 定义
  icon.png              ui.icon 指向的文件（除非用 lucide:）
  web/  |  skill/  |  bin/                 按 package.kind 三选一
```

分发格式 `.ukapp` = 上述目录的 **gzip 压缩 tar 归档**，包根目录直接是 `uking-app.json`（不套一层目录）。

---

## 5. 为什么是两份清单，不是一份

因为 ActionParity 的 schema 是**封闭的**：根节点和全部 8 个 `$def` 都写了 `additionalProperties: false`。往 `action-parity.json` 里加 `ui` 或 `permissions` 字段，官方校验器会直接判失败——而「第三方小程序的清单能原样过官方校验器」正是这套东西的立身之本。

于是拆成两份，各司其职：

| 文件 | 归属 | 回答的问题 |
|---|---|---|
| `action-parity.json` | ActionParity 标准 | **它能做什么** |
| `uking-app.json` | 本剖面 | **它长什么样、怎么装、准许它碰什么** |

**防漂移铁律：`uking-app.json` 里 MUST NOT 出现任何动作定义**，只能引用动作 ID。能力的唯一真相源是 `action-parity.json`。宿主在安装时校验二者一致（身份、版本、动作 ID 引用），对不上装不进去。

> 曾考虑过「单文件内嵌 `action_parity` 对象、安装器再拆」。否决理由：那会产生第二套 U-King 私有的序列化格式，注定漂移；而且要求**开发中**的目录就能过 `action-parity validate`，不能只有安装后才行。脚手架同时吐两个文件，作者体验成本为零。

---

## 6. 动作命名空间

```
app.<slug>.<域>.<动词>          例：app.imagefix.watermark.remove
```

- `slug` MUST 匹配 `^[a-z][a-z0-9-]{1,23}$`。**禁用下划线**——MCP 工具名要把点换成下划线，允许下划线就会撞车。
- 小程序的每个动作 ID MUST 以 `app.<slug>.` 开头，且后面至少还有两段。
- 宿主 MUST 拒绝安装不满足上述条件的包。

这条规则让命名冲突在结构上不可能发生：CLI、MCP、影核三个面上，任意两个小程序的动作永远不会重名。宿主自己的动作（`runtime.*` 等）不带 `app.` 前缀，天然隔离。

---

## 7. 三种形态

`package.kind`：

### `web` —— 主轨
一堆 HTML/CSS/JS，跑在宿主提供的 WebView 里。**AI 可以直接生成**，跨平台，沙箱最严。绝大多数小程序应该是这一类。

### `script`
`SKILL.md` + 脚本（node / python）。桥接已有的 skill 生态：装进来的同时会被扇出到本机已安装的 AI 工具（`~/.claude/skills` 等）。

### `native`
一个外部可执行文件。清单里 MUST 声明它自己的 ActionParity CLI 子命令：

```
<exe> <action_cli> list|describe|manifest|run <id> --json --no-input
```

宿主据此登记它、给它一个图标、拉起它、并让 AI 无头调用它。`sha256` SHOULD 填写；不填的话宿主无法验证这个 exe 没被掉包，会在安装时警告。

> `native` 是为「已经有成品软件、想接进 U-King 生态」准备的。它拿不到 web 那一档的沙箱保证——用户装一个 native 小程序，等同于装一个普通桌面软件，宿主 MUST 在安装前如实这么讲。

---

## 8. 无头执行：parity 不能是口号

这是整份规范最容易做假的地方，所以规则写死：

**任何声明 `execution.headless: true` 的动作，其实现 MUST 位于一个不依赖 GUI 的地方。**

对 `kind: "web"`，这意味着 `package.web.actions` MUST 指向一个**不碰 DOM 的 ES 模块**：

```js
// web/actions.mjs —— 动作的唯一实现
export async function watermarkRemove(input, ctx) { /* ... */ }
export default { "app.imagefix.watermark.remove": watermarkRemove };
```

- GUI 文档 import 它；
- 宿主在无头调用时，用自带的 Node import 同一个文件。

**一份实现，两个面。** 不是两边各写一遍然后祈祷它们一致——那种做法在第一次改需求时就会分叉，而分叉之后 GUI 还是对的，AI 那条路悄悄坏掉，没人发现。

模块里 MUST NOT 出现 DOM、`fetch`、`fs` 或任何外部域名。它需要的一切能力由宿主通过 `ctx.uking` 注入（§9）。这既是安全边界，也是让同一份代码能在浏览器和 Node 两种宿主里跑起来的前提。

做不到的动作，就诚实地写 `headless: false`，并按 ActionParity §7 给出 `parity_exceptions`（带 `reason` / `owner` / `review_by`）。**声明做不到是合规的；声明做得到然后做不到不是。**

---

## 9. 宿主桥 `uking`

小程序不直接访问任何系统资源。它拿到的是一个注入对象：GUI 里是 `window.uking`，动作模块里是 `ctx.uking`，两者 API 完全一致。

```ts
uking.action(id, input)                   // 调用动作（自己的，或获准的宿主动作）
uking.ai.imageEdit({ image, prompt, size })
uking.ai.imageGen({ prompt, size, quality })
uking.ai.chat({ system, user })
uking.file.save(name, dataUrl)            // 弹原生「另存为」，用户选路径
uking.file.open(filters)                  // 弹原生「打开」
uking.storage.get(key) / set(key, value)  // 只在本小程序的沙箱里
uking.ui.toast(msg) / progress(pct, label) / close()
uking.image.*                             // 解码 / 裁剪 / 缩放 / 合成 / 编码（见下）
uking.artifact.emit({kind, data, message})// 交付成品，返回引用（见 §11.1）
```

`uking.image.*` 的存在是有意的：动作模块不能用 canvas（Node 里没有），又不该各自去啃图像格式。宿主提供这组原语，小程序只写业务逻辑。

**GUI 文档 MUST NOT 自行引入桥脚本。** 宿主在返回入口 HTML 时会把桥注入 `<head>`。这样 AI 生成的小程序不可能漏写，两种容器（内嵌 iframe / 独立窗口）的行为也不会分叉。

### 桥不做什么

- **绝不下发凭据。** 小程序永远拿不到 API Key、base URL 或鉴权头。所有 AI 调用在宿主进程里完成，小程序只收到结果字节。
- **绝不代理任意网络请求。** `uking` 上没有通用 `fetch`。

---

## 10. 权限与授权

一切默认拒绝。`uking-app.json` 的 `permissions` 是小程序**申请**的上限，宿主在**每次调用前**核验。

| 组 | 说明 |
|---|---|
| `ai.*` | 图像生成 / 图像编辑 / 对话 / 视频。`max_calls_per_run` 是每轮硬上限，防止跑飞的循环烧光用户额度 |
| `fs.app_data` | 只能读写自己的沙箱目录，别的路径一概不可达 |
| `fs.save_dialog` / `open_dialog` | 只能弹原生对话框，**路径由用户选**，小程序无从得知任意路径 |
| `net.allow[]` | HTTPS 源白名单，会被追加进下发的 CSP `connect-src`。留空 = 完全断网 |
| `host_actions[]` | 允许调用的宿主动作 ID。留空 = 一个都不许 |

宿主 MUST 满足：

1. **授权在面之下强制。** 小程序无论从 GUI、从无头模块、还是从 devtools 发起，走的是同一道闸门。绕过 UI 不会获得更多权力（ActionParity §11.1）。
2. **权限在下载之前告知。** 市场条目里的 `permissions_summary` 就是干这个的——不能等字节都落盘了才问用户同不同意。
3. **凭据不下发**（§9）。
4. **CSP 由宿主下发**，至少 `connect-src 'self'`（外加获准的 `net.allow`）、`object-src 'none'`、`base-uri 'none'`。
5. **小程序的窗口不得调用宿主的任何内部命令。** 小程序页面里通常仍然**看得见**宿主框架的 IPC 通道对象（在 Tauri 2 上就是 `window.__TAURI_INTERNALS__`），宿主 MUST 在**调用入口**按发起方身份拒绝，而不是指望它不存在。

   > ⚠️ 实现者注意，这是个已经踩过的坑：Tauri 2 的 capability `windows` 白名单**拦不住这件事**。那份白名单管的是 plugin/core 权限（`core:window:allow-*` 之类），而 `generate_handler!` 注册的**应用自定义命令默认不受 capability 约束**。实测中，一个 label 不在白名单里的小程序窗口成功调到了宿主命令并拿回了完整结果。正确做法是在 `invoke_handler` 这一个闸门上按 webview label 判定并拒绝。
   >
   > 小程序本来也不需要宿主的 IPC —— 它的一切能力走 `uking://rpc`，那条路才有权限核验。
6. **解包必须加固**：拒绝 `..`、绝对路径、盘符、符号链接、Windows 保留名；限制条目数、解压总量、单条大小与压缩比。

> 诚实的边界：以上保护的是**小程序拿不到用户凭据**。它不保护凭据不被机器的所有者拿到——客户端就该当成可被反编译的。

---

## 11. 产出：交引用，不交像素

### 11.1 为什么

同一个动作会被三种客户端调用，它们能消化的东西差别极大：

| 调用方 | 能拿什么 |
|---|---|
| 小程序 GUI | 像素 —— 它要画出来 |
| 终端里的 agent（Claude Code / Hermes / 任意 MCP 客户端） | **只有文本** |
| 远端影子 | 引用 + 事件 |

一个动作往终端返回 `data:image/png;base64,...` 会是几 MB 乱码，白白撑爆 agent 的上下文，而且用户什么也看不见。

所以：**产出 MUST 经 `uking.artifact.emit()` 交给宿主，动作的 `output_schema` 里 MUST NOT 内联大块二进制。** 返回的是引用：

```json
{ "ok": true,
  "artifact": { "id": "art_7f3a", "kind": "image", "w": 2000, "h": 1500,
                "path": "…/.uking/artifacts/art_7f3a.png" },
  "message": "已去除水印 · 2000×1500" }
```

`message` 是一行人话，专门给文本客户端看。

### 11.2 宿主责任

- 产物落到统一收件箱，GUI 侧经 `uking://localhost/artifact/<id>` 取像素；
- 宿主 SHOULD 提供未读计数，供界面做角标；
- 宿主 MUST NOT 因为一次外部 agent 的调用就抢用户焦点。agent 干活时用户很可能在忙别的，弹窗是骚扰 —— 静默入箱 + 角标，是否查看由用户决定。

## 12. 坐标与图像约定

涉及图像区域的动作，其矩形 MUST 以**源图自然像素**表示，左上角为原点。不是预览像素，不是 CSS 像素，不是百分比。

理由：预览缩放是 GUI 的私事，而动作要能被 CLI 和 MCP 无头调用——那时根本没有「预览」这个概念。把缩放换算留在 GUI 里，动作契约才是自洽的。

小程序 SHOULD 保持源图分辨率。把用户的 4000×3000 照片交给一个只输出 1024×1024 的模型，然后把 1024 的结果当成品返回，是一种静默的质量损失，用户往往到打印时才发现。

---

## 13. 分发

- **`.ukapp`**：tar.gz。用 `uking-app pack <dir>` 打包，校验不通过会拒绝打包。
- **注册表 feed**：任意 HTTPS 上的一个静态 JSON（见 `schema/uking-app-registry.schema.json`）。**没有中心权威**，宿主可以同时订阅多个源。
- feed 里的条目是**广告，不是真相**。宿主 MUST 在安装前校验 `sha256`，并对解包后的包重新做一遍完整校验——不信任 feed 说了什么。
- `yanked_reason` 用于安全撤回：宿主 MUST 隐藏该版本，并警告已经装了的用户。

---

## 14. 符合性

一个小程序符合 **MiniApp 0.1**，当且仅当：

1. `uking-app.json` 通过 `schema/uking-app.schema.json`，且 `profile` 为 `action-parity/miniapp@0.1`；
2. `action-parity.json` 通过**未经修改的**上游 ActionParity 0.1.0 校验器；
3. 两份文件的 `id` 与 `version` 一致；
4. 每个动作 ID 都在 `app.<slug>.` 命名空间内；
5. 每个动作至少绑定到一个 `kind: "gui"` 的面（有人能点）；
6. 每个 `headless: true` 的动作都有 GUI 之外的实现（§8），且绑定到 cli/mcp/api 中至少一个面；
7. 清单引用的文件在包里真实存在。

一条命令验完：

```bash
npx uking-app validate <dir>
```

宿主侧的符合性（沙箱、权限闸门、桥、解包加固）由宿主承担，不是小程序作者的责任。

---

## 15. 还没定的事

诚实列出来，免得别人以为这些已经想清楚了：

- **签名与信任链**尚未定义。现在只有 `sha256` 完整性校验，回答不了「这个包是谁做的」。native 形态尤其需要。
- **计费归属**：小程序花掉的是用户的额度，目前只有 `max_calls_per_run` 一道闸。缺按小程序维度的用量账本。
- **版本与迁移**：升级时 `.data/` 沙箱怎么迁移，没有规定。
- **小程序之间互调**：`host_actions` 只允许调宿主动作，A 小程序调 B 小程序的动作还没设计。
- **非 Windows 宿主**：本剖面写的时候只有一个 Windows 宿主实现。`native` 形态的 `platforms` 字段是为未来留的，还没验证过。
- **英文版**：本文目前只有中文。作为面向国际的开放标准，英文规范性文本是必须补的。

欢迎在 issue 里争论这些。在两个独立实现跑通之前，字段名都还能改。
