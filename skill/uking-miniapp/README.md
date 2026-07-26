# uking-miniapp

> 对你的 AI 说「做个去水印的小工具」，它给你做出来、验过、装上。

一个技能包。装进 Claude Code / ClawX / OpenClaw / 任何支持 skill 的 AI，然后你就可以说：

```
做个小程序：拖进一堆图片，一键统一改成 800×800 并导出
做个去水印的工具，我框一下它就把水印抹掉
做个把身份证从照片里抠出来摆正的东西
```

AI 会照 [U-King 小程序开放规范](https://github.com/dongsheng123132/uking-miniapp) 生成、校验、安装。产出是一个**装上就能点**的桌面小工具，同时自动成为 CLI 命令和 MCP 工具。

---

## 装这个技能

**Claude Code**

```bash
git clone https://github.com/dongsheng123132/uking-miniapp
cp -r uking-miniapp/skill/uking-miniapp ~/.claude/skills/
```

**ClawX / OpenClaw**

```bash
cp -r uking-miniapp/skill/uking-miniapp ~/.openclaw/skills/
```

**U-King 自带** —— 装了 U-King 就有，不用手动装。

## 还需要什么

小程序要装进 **U-King** 才能跑（它提供沙箱、图像能力、权限闸和三个调用面）。

**下载：https://www.u-king.org** —— 免费。

没装也能先做：做完打包成 `.ukapp`，装好 U-King 后双击安装即可。

## 做出来的东西长什么样

```
my-app/
  uking-app.json        长什么样、怎么装、准许它碰什么
  action-parity.json    它能做什么          ← 这份是开放标准的，不是我们的
  web/
    index.html          界面
    actions.mjs         业务（不碰 DOM，所以界面和 AI 无头调用共用同一份）
```

写一次，三个面自动都有：

```
          ┌── 人：U-King 首页点图标
小程序 ──┼── AI：app_myapp_do_run（MCP 工具）/ U-King.exe action run …
          └── 手机：影核协议，同一个 action_id
```

## 手动用（不通过 AI）

```bash
node scripts/new-app.mjs --slug watermark --name 加水印 --summary "给图片批量加水印"
# 在 web/actions.mjs 的 TODO 处写业务
npx uking-app validate ./watermark      # 硬闸门，不过不给装
node scripts/install-local.mjs ./watermark
```

## 为什么值得

| | skill | MCP server | **U-King 小程序** |
|---|:--:|:--:|:--:|
| 有界面，小白能用 | ✗ | ✗ | ✓ |
| 有类型契约，AI 知道怎么调 | ✗ | ✓ | ✓ |
| 有权限模型和沙箱 | ✗ | 半 | ✓ |
| 一次实现，多个面 | ✗ | ✗ | ✓ |

而且它**向下投影成 MCP** —— 装一个小程序，任何 MCP 客户端白拿，不用为每个 agent 各接一遍。

## 许可

Apache-2.0
