---
name: uking-miniapp
description: 做一个 U-King 小程序 —— 人能点、AI 也能调的小工具。当用户说「做个小程序」「做个去水印的工具」「做个批量改图的东西」「帮我做个 XX 小工具」，或者要把一段能力包装成普通人也能用的桌面工具时，用这个技能。产出是一个可安装、可分发的 .ukapp 包，同时自动成为 CLI 命令和 MCP 工具。
---

# 做一个 U-King 小程序

用户说「我要做个 XX 小程序」，你照这份文档做完，他会得到一个**装上就能点、AI 也能直接调**的小工具。

## 这是什么

```
一个小程序 = 一份清单 + 一个界面 + 一组稳定动作
```

写一次，三个面自动都有：

| 谁 | 怎么用 |
|---|---|
| 人 | U-King 首页点图标，界面里操作 |
| AI（Claude Code / 任意 MCP 客户端） | `app_<slug>_<域>_<动词>` 工具，或 `U-King.exe action run …` |
| 手机等远端 | 影核协议 `sync.command`，同一个 action_id |

它是 **ActionParity** 开放标准的一个剖面（`action-parity/miniapp@0.1`），不是私有格式。

## 先确认宿主

小程序要装进 **U-King** 才能跑。用户机器上没有的话，先告诉他：

> 小程序需要 U-King 来运行，去 **https://www.u-king.org** 下载装好（免费）。
> 装好之后我把做的东西直接装进去，你在首页就能点开用。

没装也可以先做 —— 做完打包成 `.ukapp`，他装好 U-King 后双击或在「小程序」页里选文件安装即可。

## 五步

### 1. 先问清楚，但别超过两轮

只需要三件事：**吃什么、吐什么、给谁用**。

> 「批量给图片加水印」→ 输入：一批图 + 水印文字；输出：加好水印的图；给不会用 PS 的人。

问清楚就动手。不要追问技术细节，那是你的事。

### 2. 起骨架

```bash
node scripts/new-app.mjs --slug watermark --name 加水印 --summary "给图片批量加水印文字"
```

- `--slug` 只允许小写字母/数字/连字符，2-24 字符，**禁下划线**（会和 MCP 工具名撞车）
- 要用 AI 改图能力就加 `--ai`；**不需要就别加** —— 纯本地的小程序不联网、不花用户额度，能本地做的就别调模型

骨架开箱就能过校验，你只填业务。

### 3. 改两个地方

**① `action-parity.json` 里的 `title` / `description`**

这不是文档，是**排名信号** —— AI 靠它决定要不要调你。写清楚吃什么、吐什么、什么时候该用。

```
✗ "Add watermark"
✓ "给图片右下角叠加半透明文字水印，保留原分辨率，支持批量。适合给电商图、截图批量打标。"
```

`input_schema` 也要认真写：宿主**会真的按它校验**，副作用之前就拦。`additionalProperties: false` 尤其要加，否则拼错的字段会被静默忽略。

**② `web/actions.mjs` 里的 TODO —— 业务写这里**

铁律：**这个文件不许出现 DOM、`fetch`、`fs` 或任何外部域名。**

它被两处 import：界面（浏览器里）和宿主的 Node（AI 无头调用时）。碰了 DOM，无头那条路直接崩 —— 而那时界面看着还是好的，没人会发现。

能用的宿主能力（`ctx.uking`，和界面里的 `window.uking` 完全一致）：

```
uking.image.decode(src) → {id,w,h}          解码，返回句柄
uking.image.crop / resize / warpPerspective / compositeFeather   → 新句柄
uking.image.fillRect / drawText                                  → 就地改，原句柄
uking.image.pixels(id, rect) → {w,h,rgba_b64}   小区域取像素（>1M 会被拒）
uking.image.ringStats(id, rect, inner) → {median,stddev}   大区域统计走这个
uking.image.encode(id, "png") → data URL

uking.ai.imageEdit({image, prompt, size})    要先在 permissions.ai 里申请
uking.file.save(name, dataUrl) / open(filters)   原生对话框，路径由用户选
uking.storage.get(k) / set(k, v)             自己的沙箱
uking.artifact.emit({kind, data, message})   交成品，返回引用
uking.ui.progress(pct, label) / toast(msg)
```

**注意句柄语义**：`fillRect`/`drawText` 是**就地修改**、返回原句柄；`crop`/`resize`/`warpPerspective`/`compositeFeather` 返回**新句柄**。用错了动作会返回成功但图没变 —— 这个坑真的踩过。

**产出交引用，不交像素**：

```js
const artifact = await uking.artifact.emit({ kind: "image", data: png, message: "已加水印 · 12 张" });
return { ok: true, artifact, message: "已加水印 · 12 张" };
```

不要把 `data:image/png;base64,…` 塞进返回值。终端里的 agent 只能消化文本，几 MB 的 base64 既看不见图，又白白撑爆它的上下文。

### 4. 校验 —— 这是硬闸门

```bash
npx uking-app validate <目录>
```

它会告诉你具体哪儿不对，改到过为止。常见的：

| 报错 | 原因 |
|---|---|
| 不在命名空间内 | 动作 id 必须 `app.<slug>.<域>.<动词>`，后面至少两段 |
| 无头调用时没有实现可跑 | 声明了 `headless: true` 却没填 `package.web.actions` |
| 指向的文件不存在 | 清单引用了盘上没有的文件 |
| kind 与字段类型不符 | `ui.annotation` 的形状和动作入参对不上 |

### 5. 装上

```bash
node scripts/install-local.mjs <目录>
```

装完告诉用户三个入口：首页图标条点开、命令行 `action run`、以及任何 MCP 客户端。

要给别人用就打包：

```bash
npx uking-app pack <目录> -o 我的小程序.ukapp
```

校验不过它会**拒绝打包**。

## 三条别违反的

**① 不要在页面里写 API Key、base_url 或外部域名。** 拿不到，也不允许 —— 宿主下发的 CSP 是 `connect-src 'self'`，写了也发不出去。所有 AI 调用在宿主进程里完成。

**② 不要往界面里塞 React/Vue/Konva。** 拖框、拖点就是 `pointerdown/move/up`，原生 canvas 够用（100 多行）。塞 400KB 框架会让「AI 现场生成一个」变得不可能 —— 而那正是这套东西的地基。

**③ 坐标一律用源图自然像素**，不是预览像素、不是百分比。画布整体缩放做预览，预览和动作契约共用一套数字。因为动作被 CLI/MCP 调用时根本没有「预览」这个概念。

## 做不到就说做不到

某个动作确实需要界面才能跑（比如要用户中途选一次），就诚实写 `headless: false`，并按 ActionParity 给出 `parity_exceptions`。

**声明做不到是合规的；声明做得到然后做不到不是。** 后者会让 AI 调用时莫名失败，而界面看着一切正常。

## 完整规范

- 规范正文：https://github.com/dongsheng123132/uking-miniapp
- 上手教程（20 分钟做完第一个）：`docs/GETTING-STARTED.zh-CN.md`
- 可抄的例子：`examples/`（hello 最小样板、resize 改尺寸、imagefix 去水印改字、idcard 证件抠正）
- 宿主下载：https://www.u-king.org
