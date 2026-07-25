# U-King MiniApp Profile

> Installable little tools that a person can click **and** an agent can call — from the same package, through the same code path.
>
> `action-parity/miniapp@0.1` · [中文](./README.zh-CN.md)

---

## In one line

**A MiniApp = one manifest pair + one GUI shell + a set of ActionParity actions.**

```
          ┌── a person:  clicks the icon on the home row, drags a box, hits apply
MiniApp ──┼── an agent:  U-King.exe action run app.imagefix.text.replace  /  an MCP tool
          └── a shadow:  ShadowCore sync.command — the very same action_id
```

It exists because of a concrete, recurring problem. What people ask for is usually neither "an AI capability" nor "an app", but the two fused:

> open an image → drag a box around the watermark → apply → save.

A skill alone is unusable by non-technical people. A GUI alone is invisible to agents. This profile defines how that fusion is packaged, installed, sandboxed, and used from both sides at once.

---

## Five minutes

```bash
npx uking-app info examples/hello          # what a minimal package looks like
npx uking-app validate examples/imagefix   # our profile rules + upstream ActionParity lint
npx uking-app pack examples/imagefix       # → a distributable .ukapp
```

A package:

```
my-app/
  uking-app.json        presentation / packaging / permissions   ← this profile
  action-parity.json    identity / surfaces / actions            ← the ActionParity standard
  icon.png
  web/
    index.html          the GUI: draws the interface, gathers input
    actions.mjs         the action implementations (DOM-free)    ← the important one
```

---

## Three decisions worth defending

### 1. Two manifests, not one

The ActionParity schema is **closed** — `additionalProperties: false` at the root and in all eight `$defs`. Adding `ui` or `permissions` to `action-parity.json` makes the official validator reject it, and "a third-party manifest passes the official validator unmodified" is the whole point.

So the files split by question: `action-parity.json` answers **what it can do**; `uking-app.json` answers **what it looks like, how it installs, and what it is allowed to touch**. The latter MUST NOT define actions — only reference their IDs. The host checks the two agree at install time.

### 2. Action implementations live in `actions.mjs`, not in the HTML

Any action declaring `headless: true` MUST be implemented in a **DOM-free ES module**. The GUI imports it; the host imports the same file when invoking headlessly.

**One implementation, two surfaces.** Not two implementations that are hoped to agree — those diverge at the first requirement change, and when they do the GUI still looks right while the agent path quietly breaks and nobody notices.

If an action genuinely can't run headless, declare `headless: false` and file `parity_exceptions`. **Declaring that you can't is conforming; declaring that you can and then not doing it is not.**

### 3. A MiniApp never receives a credential

There is no generic `fetch` on the `uking` bridge. Every AI call happens in the host process; the mini-app receives only the resulting bytes. The host serves a CSP with `connect-src 'self'`, so even a hard-coded third-party origin cannot be reached.

Permissions default to denied and are enforced **below every surface** — the same gate applies whether the call comes from the GUI, from the headless module, or from devtools.

---

## Relationship to ShadowCore

This is not a new protocol. It is an ActionParity profile, a sibling of the ShadowCore (cross-device) profile:

```
ActionParity 0.2.0  ── the shared model: actions / state / events / authority
        ├── ShadowCore Profile   one core, many shadows  (cross-device sync)
        └── MiniApp Profile      one shell, many callers (installable units)   ← this repo
```

**ShadowCore needs no changes to support MiniApps.** Installing one extends the device's action surface; a shadow re-fetches `action manifest`, discovers the new capability, and invokes it with the same `action_id` over `sync.command`. Confirmation flows read `effects.confirmation` straight from the mini-app's own manifest.

---

## Contents

| Path | What |
|---|---|
| [`docs/GETTING-STARTED.zh-CN.md`](./docs/GETTING-STARTED.zh-CN.md) | **Build your first mini-app** (Chinese; English pending) |
| [`profiles/miniapp-0.1.en.md`](./profiles/miniapp-0.1.en.md) | **The specification** (English) |
| [`profiles/miniapp-0.1.md`](./profiles/miniapp-0.1.md) | 规范正文（中文，权威版本） |
| `schema/uking-app.schema.json` | JSON Schema for the mini-app manifest |
| `schema/uking-app-registry.schema.json` | Market feed shape — decentralised, any static JSON over HTTPS |
| `examples/hello/` | The smallest runnable package |
| `examples/resize/` | The tutorial result: resize an image |
| `examples/imagefix/` | A real one: drag a box, remove a watermark or replace text |
| `bin/uking-app.mjs` | validate / pack / info — **zero runtime dependencies** |

---

## Status

**Non-normative working draft.** Following ActionParity's own rule, a profile earns normative status only after **two independent products** complete the adoption loop. There is exactly one implementation today (U-King), so field names may change; the `profile` constant will not.

[Section 15 of the spec](./profiles/miniapp-0.1.en.md) lists what is honestly unsettled: signing and trust chain, billing attribution, data migration across upgrades, app-to-app calls, and non-Windows hosts. Arguments welcome in the issues.

License: Apache-2.0
