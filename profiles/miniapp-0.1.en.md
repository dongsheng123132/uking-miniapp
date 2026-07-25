# U-King MiniApp Profile

**ActionParity MiniApp Profile 0.1** · wire identifier `action-parity/miniapp@0.1`

> Status: **non-normative working draft.**
> Following ActionParity's own rule, this profile earns normative status only after **two independent products**
> each complete the adoption loop. There is exactly one implementation today, so field names may still change;
> the `profile` constant will not.
>
> 中文版本（权威）：[miniapp-0.1.md](./miniapp-0.1.md)。两份文本有冲突时以中文版为准，直到本剖面进入规范性文本。

---

## 1. What this solves

What people ask for is usually neither "an AI capability" nor "an app", but the two fused:

> open an image → drag a box around the watermark → apply → save.

Taken apart, that is a skill (how the AI repairs the image) plus a GUI (how you draw the box). Built separately, both are crippled: a skill alone is unusable by non-technical people; a GUI alone is invisible to agents and cannot be orchestrated.

This profile defines that fusion as one distributable, installable unit usable by people and machines at the same time:

> **A MiniApp = one manifest pair + one GUI shell + a set of ActionParity actions.**

One unit, three callers:

| Who | How |
|---|---|
| A person | Clicks the icon on the U-King home row and uses the GUI |
| An agent (local, Claude Code, any MCP client) | `U-King.exe action run app.<slug>.<domain>.<verb>`, or an MCP tool call |
| A remote shadow (phone, …) | ShadowCore `sync.command` with the very same `action_id` |

All three converge on one dispatcher inside the host. This is not "the GUI and the CLI both implement this feature" — it is "they do the same thing". The difference matters; see §8.

---

## 2. Terminology

`MUST` / `MUST NOT` / `SHOULD` / `MAY` are to be interpreted per RFC 2119.

- **Host** — the U-King desktop application. It installs, sandboxes and dispatches mini-app action calls.
- **MiniApp** — an installable unit conforming to this profile.
- **Surface** — ActionParity's term: one way of presenting the same set of actions (GUI, CLI, MCP, …).
- **Actions module** — the DOM-free ES module inside a mini-app where its actions are implemented, once.

---

## 3. Relationship to ActionParity and ShadowCore

This is **not** a new protocol. It is a profile of ActionParity 0.2.0, a sibling of ShadowCore (`action-parity/sync@0.1`):

```
ActionParity 0.2.0   — the shared model: actions / state / events / authority
        ├── ShadowCore Profile   one core, many shadows  (cross-device sync)
        └── MiniApp Profile      one shell, many callers (installable units)   ← this document
```

Therefore:

- A mini-app's actions **are** ActionParity actions; its `action-parity.json` passes the upstream validator unmodified.
- **ShadowCore needs no changes.** A shadow sends `sync.command`; the `action_id` field in `action-parity-sync.schema.json` is just a non-empty string, so namespaced IDs travel unchanged.
- Installing a mini-app **extends the device's action surface**. A shadow re-fetches `action manifest` and discovers the new capability.
- Confirmation for risky actions reads `effects.confirmation` straight from the mini-app's own manifest. No second mechanism.

---

## 4. Package layout

```
<package>/
  uking-app.json        required  presentation / packaging / permissions   ← this profile
  action-parity.json    required  identity / surfaces / actions            ← ActionParity 0.2.0
  icon.png              whatever ui.icon points at (unless `lucide:`)
  web/  |  skill/  |  bin/                      one of, per package.kind
```

The distribution format `.ukapp` is a **gzip-compressed tar archive** of that directory, with `uking-app.json` at the archive root (not nested inside a folder).

---

## 5. Why two manifests, not one

Because the ActionParity schema is **closed**: `additionalProperties: false` at the root and in all eight `$defs`. Adding a `ui` or `permissions` key to `action-parity.json` makes the official validator reject the file — and "a third-party manifest passes the official validator unmodified" is the whole point of this exercise.

So the files split by the question they answer:

| File | Owner | Answers |
|---|---|---|
| `action-parity.json` | The ActionParity standard | **what it can do** |
| `uking-app.json` | This profile | **what it looks like, how it installs, what it may touch** |

**Anti-drift rule: `uking-app.json` MUST NOT contain any action definition**, only references to action IDs. `action-parity.json` is the single source of truth for capability. The host verifies the two agree at install time (identity, version, action-ID references) and refuses the package otherwise.

> A single file with an embedded `action_parity` object, split by the installer, was considered and rejected: it creates a second, vendor-private serialisation that will drift, and it breaks the requirement that the **authored** directory — not only the installed one — passes `action-parity validate`. A scaffolder emits both files, so the authoring cost is zero.

---

## 6. Action namespace

```
app.<slug>.<domain>.<verb>        e.g. app.imagefix.watermark.remove
```

- `slug` MUST match `^[a-z][a-z0-9-]{1,23}$`. **Underscores are forbidden** — MCP tool names map dots to underscores, and permitting both would allow collisions.
- Every action ID MUST begin with `app.<slug>.` and have at least two further segments.
- The host MUST refuse to install a package that violates either rule.

This makes namespace collisions structurally impossible across the CLI, MCP and ShadowCore surfaces. Host actions (`runtime.*` and friends) carry no `app.` prefix and are therefore isolated by construction.

---

## 7. Three package kinds

`package.kind`:

### `web` — the main track
HTML/CSS/JS running in a WebView the host provides. **An AI can generate one directly**, it is cross-platform, and it gets the strictest sandbox. Most mini-apps should be this.

### `script`
`SKILL.md` plus scripts (node / python). Bridges the existing skill ecosystem: installing one also fans it out to the AI tools present on the machine (`~/.claude/skills` and friends).

### `native`
An external executable. The manifest MUST declare its own ActionParity CLI subcommand:

```
<exe> <action_cli> list|describe|manifest|run <id> --json --no-input
```

The host registers it, gives it an icon, launches it, and lets agents invoke it headlessly. `sha256` SHOULD be provided; without it the host cannot verify the binary has not been swapped, and warns at install time.

> `native` exists so that finished software can join the ecosystem. It does **not** get the sandbox guarantees of `web`. Installing a native mini-app is equivalent to installing an ordinary desktop program, and the host MUST say so plainly before installing.

---

## 8. Headless execution: parity cannot be a slogan

This is the easiest place in the whole profile to cheat, so the rule is absolute:

**Any action declaring `execution.headless: true` MUST be implemented somewhere that does not depend on a GUI.**

For `kind: "web"` that means `package.web.actions` MUST point at a **DOM-free ES module**:

```js
// web/actions.mjs — the single implementation
export async function watermarkRemove(input, ctx) { /* ... */ }
export default { "app.imagefix.watermark.remove": watermarkRemove };
```

- The GUI document imports it;
- the host imports the same file, under its bundled Node, for headless invocation.

**One implementation, two surfaces.** Not two implementations that are hoped to agree — those diverge at the first requirement change, and when they do the GUI still looks correct while the agent path quietly breaks and nobody notices.

The module MUST NOT use the DOM, `fetch`, `fs`, or any external origin. Everything it needs is injected by the host through `ctx.uking` (§9). That is both the security boundary and the precondition for the same file running under a browser and under Node.

### 8.1 The host MUST enforce this, not merely write it down

**"The module MUST NOT touch fs" is a requirement on the author; the host MUST make it impossible.** The difference is critical. The GUI side has the browser origin sandbox underneath it; the headless side does not — the actions module runs inside the host’s own Node process and, by default, **can read the entire user directory**.

Measured (Node 22.14, a malicious `actions.mjs` of about a dozen lines):

```
plain run:          read all of ~/.uking/ (device.json holds the API key) and spawned a child process
permission model:   ERR_ACCESS_DENIED on both — while legitimate mini-apps are unaffected
```

So the host MUST launch the runner under Node’s built-in permission model, opening only what is needed:

```
node --experimental-permission \n     --allow-fs-read=<app dir> --allow-fs-read=<per-run temp dir> \n     --allow-fs-write=<per-run temp dir> \n     runner.mjs …
```

> This also closes the path where a mini-app simply reads `device.json` itself. “Never hands over credentials” (§9) is only true with this gate in place: without it, an app can bypass the bridge and take the key straight off disk.

An action that genuinely cannot run headless MUST declare `headless: false` and file `parity_exceptions` per ActionParity §7 (with `reason` / `owner` / `review_by`). **Declaring that you cannot is conforming; declaring that you can and then not doing it is not.**

---

## 9. The host bridge, `uking`

A mini-app never touches system resources directly. It receives an injected object: `window.uking` in the GUI, `ctx.uking` in the actions module. The two APIs are identical.

```ts
uking.action(id, input)                    // invoke an action (its own, or a granted host action)
uking.ai.imageEdit({ image, prompt, size })
uking.ai.imageGen({ prompt, size, quality })
uking.ai.chat({ system, user })
uking.file.save(name, dataUrl)             // native Save As — the user picks the path
uking.file.open(filters)                   // native Open
uking.storage.get(key) / set(key, value)   // this app's sandbox only
uking.ui.toast(msg) / progress(pct, label) / close()
uking.image.*                              // see §9.1
uking.artifact.emit({kind, data, message}) // deliver output, get a reference back (§11)
```

**The GUI document MUST NOT include the bridge script itself.** The host injects it into `<head>` when serving the entry HTML. That way an AI-generated mini-app cannot forget it, and the embedded-iframe and standalone-window containers cannot diverge.

### 9.1 `uking.image.*`

These primitives exist deliberately: an actions module cannot use canvas (Node has none) and should not each parse image formats itself. More importantly, the GUI and headless paths MUST compute **the same result** — putting the image maths in one host-side implementation removes the nastiest class of bug, where the picture looks right on screen but the agent gets something different.

| Verb | Semantics |
|---|---|
| `decode(src)` → `{id,w,h}` | data URL or path → handle |
| `clone(id)` | duplicate |
| `crop(id, rect)` / `resize(id, w, h)` | **return a new handle** (dimensions change) |
| `compositeFeather(base, patch, at, sel, feather, offset)` | **returns a new handle** (combines images) |
| `fillRect(id, rect, color, opts)` | **mutates in place**, returns the same handle |
| `drawText(id, opts)` | **mutates in place**, returns the same handle |
| `pixels(id, rect)` → `{w,h,rgba_b64}` | small regions only; larger than 1M pixels MUST be refused |
| `ringStats(id, rect, inner)` → `{median,stddev}` | annulus statistics, computed host-side |
| `encode(id, "png")` → data URL | produce the image |

Two rules, both learned the hard way:

**① Verbs that draw onto an image MUST mutate in place.** If they returned new handles, a caller that keeps using the old handle silently loses the drawing — the action still returns `ok: true`, the measurements are all correct, and not a single pixel changed. A test that only asserts `ok` will never catch it. Hence the split: operations that change dimensions or combine images return new handles; operations that merely draw are in-place.

**② Bulk pixels MUST NOT cross the bridge.** A 528×528 annulus is 1.1M pixels — tens of megabytes as a JSON number array. Statistics belong host-side (`ringStats`); genuinely per-pixel work happens only on small regions, transferred as base64 (over 4× smaller than a JSON number array).

> Implementation note: decoding non-PNG input and rasterising glyphs cannot be done in pure Rust without extra libraries; ffmpeg is a reasonable dependency. When it is absent the host MUST say so clearly rather than quietly producing a wrong image.

### What the bridge does not do

- **It never hands over credentials.** A mini-app never sees an API key, base URL or auth header. Every AI call completes inside the host process; the mini-app receives only the resulting bytes.
- **It never proxies arbitrary network requests.** There is no generic `fetch` on `uking`.

---

## 10. Permissions and authority

Everything is denied by default. `permissions` in `uking-app.json` is the **ceiling a mini-app requests**; the host checks it **before every call**.

| Group | Meaning |
|---|---|
| `ai.*` | image generation / image editing / chat / video. `max_calls_per_run` is a hard per-run ceiling that stops a runaway loop from draining the user's credits |
| `fs.app_data` | read/write its own sandbox only; no other path is reachable |
| `fs.save_dialog` / `open_dialog` | native dialogs only — **the user picks the path**; the app never learns arbitrary paths |
| `net.allow[]` | HTTPS origin allow-list, appended to the served CSP `connect-src`. Empty means no network at all |
| `host_actions[]` | host action IDs it may invoke. Empty means none |

The host MUST:

1. **Enforce authority below every surface.** Whether a call originates in the GUI, in the headless module, or from devtools, it passes the same gate. Bypassing the UI grants no extra power (ActionParity §11.1).
2. **Disclose permissions before download.** That is what `permissions_summary` in a registry entry is for — the user must not be asked to consent after the bytes are already on disk.
3. **Never hand over credentials** (§9).
4. **Serve a CSP**, at minimum `connect-src 'self'` (plus any granted `net.allow`), `object-src 'none'`, `base-uri 'none'`.
5. **Refuse host-internal command calls from mini-app webviews.** A mini-app page can typically still *see* the host framework's IPC channel object (on Tauri 2, `window.__TAURI_INTERNALS__`). The host MUST reject by caller identity **at the invocation entry point**, rather than assuming the object is absent.

   > ⚠️ Implementer warning, learned in practice: Tauri 2's capability `windows` allow-list **does not cover this**. That list governs plugin/core permissions (`core:window:allow-*` and friends), while **application commands registered through `generate_handler!` are not gated by capabilities by default**. In testing, a mini-app window whose label was absent from every capability successfully invoked a host command and received the full result. The correct fix is a single gate in `invoke_handler` that rejects by webview label.
   >
   > A mini-app has no need for host IPC anyway: every capability it has goes through `uking://rpc`, which is the path that actually checks permissions.
6. **Harden unpacking**: reject `..`, absolute paths, drive letters, symlinks and Windows reserved names; cap entry count, total uncompressed size, per-entry size and compression ratio.

> An honest boundary: this protects the user's credentials **from the mini-app**. It does not protect them from whoever owns the machine — a client should be treated as decompilable.

---

## 11. Output: return references, not pixels

### 11.1 Why

The same action is invoked by three kinds of client, and what they can digest differs enormously:

| Caller | Can consume |
|---|---|
| The mini-app GUI | pixels — it has to draw them |
| An agent in a terminal (Claude Code, any MCP client) | **text only** |
| A remote shadow | references and events |

Returning `data:image/png;base64,...` to a terminal is several megabytes of noise: the user sees nothing and the agent's context is consumed for nothing.

Therefore: **output MUST be handed to the host through `uking.artifact.emit()`, and an action's `output_schema` MUST NOT inline bulk binary.** What comes back is a reference:

```json
{ "ok": true,
  "artifact": { "id": "art_7f3a", "kind": "image", "w": 2000, "h": 1500,
                "path": "…/.uking/artifacts/art_7f3a.png" },
  "message": "Watermark removed · 2000×1500" }
```

`message` is one human-readable line, written for text-only clients.

### 11.2 Host responsibilities

- Artifacts land in one inbox; the GUI fetches pixels via `uking://localhost/artifact/<id>`.
- The host SHOULD expose an unseen count so interfaces can show a badge.
- The host **MUST NOT** steal focus because an external agent completed a call. While an agent works the user is probably doing something else; a popup is an interruption. Silent delivery plus a badge — whether to look is the user's decision.

---

## 12. Coordinates and imaging

Any action taking an image region MUST express the rectangle in **source-image natural pixels**, origin top-left. Not preview pixels, not CSS pixels, not percentages.

The reason: preview scaling is the GUI's private business, whereas the action must be invocable headlessly from the CLI and MCP, where no "preview" exists. Keeping the scaling conversion inside the GUI is what makes the action contract self-consistent.

Mini-apps SHOULD preserve source resolution. Handing a user's 4000×3000 photograph to a model that only emits 1024×1024 and returning that as the finished product is a silent quality loss the user often discovers only at print time.

---

## 13. Distribution

- **`.ukapp`**: tar.gz. Build it with `uking-app pack <dir>`, which refuses to package anything that fails validation.
- **Registry feed**: a static JSON file on any HTTPS host (see `schema/uking-app-registry.schema.json`). **There is no central authority**; a host may subscribe to several.
- Feed entries are **advertisements, not truth.** The host MUST verify `sha256` before unpacking and MUST re-validate the unpacked package in full. It does not trust what the feed claims.
- `yanked_reason` exists for security withdrawals: the host MUST hide that version and warn users who already installed it.

---

## 14. Conformance

A mini-app conforms to **MiniApp 0.1** if and only if:

1. `uking-app.json` validates against `schema/uking-app.schema.json` with `profile` equal to `action-parity/miniapp@0.1`;
2. `action-parity.json` passes the **unmodified** upstream ActionParity 0.2.0 validator;
3. the `id` and `version` in the two files agree;
4. every action ID lies within the `app.<slug>.` namespace;
5. every action binds to at least one surface of `kind: "gui"` (a person can reach it);
6. every action with `headless: true` has an implementation outside the GUI (§8) and binds to at least one of cli/mcp/api;
7. every file the manifests reference exists in the package.

One command checks all of it:

```bash
npx uking-app validate <dir>
```

### 14.1 Declared parity is not evidenced parity

ActionParity 0.2.0 reports these separately, and mini-app authors should take the distinction seriously:

| | Meaning |
|---|---|
| **Declared parity** | every required surface has a binding — you **say** they all work |
| **Evidenced parity** | those bindings carry a `test` pointing at a test that actually exists — you **proved** it |

All three examples in this repository currently report `Declared 100% / Evidenced 0% / AP-1`. That is the truth: the tests are not written yet.

> `imagefix` once carried `"test": "miniapp-e2e:watermark-remove"` and friends, which made the report read `Evidenced 100% / AP-2` — while none of those tests existed. They were removed once noticed.
>
> This is the other half of §8: **declaring that you cannot is conforming; declaring that you can and then not doing it is not.** A `test` field pointing at nothing does not fool the validator — it fools whoever later automates against that manifest. Reporting AP-1 honestly is better.

Host-side conformance (sandboxing, permission gates, the bridge, unpack hardening) is the host's responsibility, not the author's.

---

## 15. Unsettled

Listed honestly, so nobody assumes these are solved:

- **Signing and a trust chain** are undefined. Only `sha256` integrity exists today, which cannot answer "who made this package". `native` needs it most.
- **Billing attribution**: a mini-app spends the user's credits and `max_calls_per_run` is the only gate. There is no per-app usage ledger.
- **Versioning and migration**: nothing specifies how the `.data/` sandbox migrates across upgrades.
- **App-to-app calls**: `host_actions` permits host actions only; one mini-app invoking another's action is not designed.
- **Non-Windows hosts**: written against a single Windows host. The `platforms` field on `native` is reserved for the future and unverified.

Arguments welcome in the issues. Until two independent implementations exist, field names remain negotiable.
