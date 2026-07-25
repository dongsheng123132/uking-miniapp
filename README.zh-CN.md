# U-King 小程序开放规范

> 让别人能基于 U-King 做出**装上就能用、AI 也调得动**的小工具。
>
> `action-parity/miniapp@0.1` · [English](./README.md)

---

## 一句话

**一个小程序 = 一份清单 + 一个 GUI 外壳 + 一组 ActionParity 动作。**

同一个单元，三种用法，走的是同一条代码路径：

```
        ┌── 人：在首页点图标，拖框、点按钮
小程序 ──┼── AI：U-King.exe action run app.imagefix.text.replace  /  MCP 工具
        └── 手机影子：影核 sync.command，action_id 一模一样
```

这解决的是一个很具体的问题：客户要的往往不是「一个 AI 能力」，也不是「一个软件」，而是两者的合体 ——

> 打开一张图 → 拖框圈住水印 → 一键应用 → 保存。

光有 skill，普通用户不会用；光有 GUI，AI 调不动。本规范定义的就是这个合体怎么打包、怎么装、怎么被两边同时使用。

---

## 五分钟上手

```bash
# 看看最小样板长什么样
npx uking-app info examples/hello

# 校验（同时跑我们的剖面规则 + 上游 ActionParity 的语义 lint）
npx uking-app validate examples/imagefix

# 打成可分发的 .ukapp
npx uking-app pack examples/imagefix -o 图片修补.ukapp
```

一个包长这样：

```
my-app/
  uking-app.json        展示 / 打包 / 权限        ← 本规范
  action-parity.json    身份 / 面 / 动作          ← ActionParity 标准
  icon.png
  web/
    index.html          GUI：画界面、收集输入
    actions.mjs         动作实现（不碰 DOM）      ← 关键
```

---

## 三个设计决定，以及为什么

### 1. 两份清单，不是一份

ActionParity 的 schema 是**封闭的**（根节点和 8 个 `$def` 全都 `additionalProperties: false`）。往 `action-parity.json` 里加 `ui` 或 `permissions`，官方校验器直接判失败 —— 而「第三方清单能原样过官方校验器」正是这套东西的立身之本。

所以拆成两份：`action-parity.json` 回答**它能做什么**，`uking-app.json` 回答**它长什么样、怎么装、准许它碰什么**。后者 MUST NOT 出现任何动作定义，只能引用动作 ID，宿主在安装时校验二者一致。

### 2. 动作实现住在 `actions.mjs`，不在 HTML 里

任何声明 `headless: true` 的动作，实现必须在一个**不碰 DOM 的 ES 模块**里。GUI import 它，宿主无头调用时也 import 同一个文件。

**一份实现，两个面。** 不是两边各写一遍然后祈祷它们一致 —— 那种做法在第一次改需求时就分叉，而且分叉后 GUI 还是对的，AI 那条路悄悄坏掉，没人发现。

做不到就诚实写 `headless: false` 加 `parity_exceptions`。**声明做不到是合规的；声明做得到然后做不到不是。**

### 3. 小程序永远拿不到密钥

`uking` 桥上没有通用 `fetch`。所有 AI 调用在宿主进程里完成，小程序只收到结果字节。宿主下发的 CSP 是 `connect-src 'self'`，就算页面里硬写了外部域名也发不出去。

权限一切默认拒绝，且**在面之下强制** —— 从 GUI、从无头模块、还是从 devtools 发起，走的是同一道闸门。

---

## 与影核（ShadowCore）的关系

本剖面**不是**新协议，是 ActionParity 的一个剖面，与影核平级：

```
ActionParity 0.1.0  ── 动作 / 状态 / 事件 / 授权 的公共模型
        ├── ShadowCore Profile   一核多影：跨设备同步
        └── MiniApp Profile      一壳多用：可安装单元      ← 本仓库
```

因此**影核不需要为小程序做任何改动**。装一个小程序 = 给这台设备的动作面扩容；影子重新拉一次 `action manifest` 就发现了新能力，`sync.command` 里带上同一个 `action_id` 即可调用。高风险动作的确认流程直接吃小程序清单里的 `effects.confirmation`。

---

## 目录

| 路径 | 内容 |
|---|---|
| [`profiles/miniapp-0.1.md`](./profiles/miniapp-0.1.md) | **规范正文**（中文，权威版本） |
| [`profiles/miniapp-0.1.en.md`](./profiles/miniapp-0.1.en.md) | English specification |
| `schema/uking-app.schema.json` | 小程序清单的 JSON Schema |
| `schema/uking-app-registry.schema.json` | 市场 feed 的形状（去中心，任意 HTTPS 静态 JSON） |
| `examples/hello/` | 最小可运行样板 |
| `examples/imagefix/` | 真实小程序：拖框去水印 / 改文字 |
| `bin/uking-app.mjs` | 校验 / 打包 / 摘要，**零运行时依赖** |

---

## 状态

**非规范性工作草案。** 按 ActionParity 的既定做法，要等**两个互相独立的产品**各自走完接入闭环才谈得上进入规范性文本。现在只有 U-King 一家实现，所以字段名可能变，`profile` 常量不会变。

[规范正文第 15 节](./profiles/miniapp-0.1.md#15-还没定的事)如实列出了还没想清楚的事：签名与信任链、计费归属、升级时的数据迁移、小程序互调、非 Windows 宿主。欢迎在 issue 里争论。

许可：Apache-2.0
