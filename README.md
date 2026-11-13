# dsh-ppt-kit

A [DSH](https://github.com/deepseek-ai) plugin that turns three complementary tools into one repeatable PowerPoint workflow:

```
template contract  →  contract-driven build  →  surgical editing  →  rendered verification
agent-slides          agent-slides             KitchenSink4PPT     office-* / KS4PPT
```

The plugin itself ships **no PPT engine**. What it adds is the part you cannot get from any single tool: the boundaries between them, the order they must run in, and a doctor that explains what is missing when something fails.

> Design rationale, trade-offs, and — importantly — the conditions under which this plugin stops being worth using: [DESIGN.md](DESIGN.md).
> What has actually been measured, and what has **not**: [RESULTS.md](RESULTS.md). Read section 0 before quoting any number from it.

## Why

| | agent-slides | KitchenSink4PPT | office-* |
|---|---|---|---|
| Extract template contract (layouts, geometry, theme, archetypes) | ✅ | ❌ | ❌ |
| Build a deck that respects that contract | ✅ | ❌ | ⚠️ generic writes |
| Surgical edits (145 atomic ops: tables, charts, masters, connectors, SVG) | ⚠️ rebuild-style | ✅ | ⚠️ basic |
| Rendered verification (PNG/PDF) | ⚠️ coarse QA | ✅ needs external LibreOffice | ✅ bundled engine |

No single tool covers *template fidelity + fine editing + verification*. The dangerous seam is the edit model: agent-slides **re-renders the whole deck**, KitchenSink4PPT edits **the shape in place**. Run a render after surgical edits and those edits disappear — silently, with no error. This plugin makes that rule explicit instead of leaving it to chance.

## Requirements

- DSH `0.2.1` or newer
- [`uv`](https://docs.astral.sh/uv/) on `PATH` (both tools are Python packages fetched on first use)
- Optional: LibreOffice — only for PDF / slide-image export
- Optional but recommended: [`dsh-office-kit`](https://www.npmjs.com/package/dsh-office-kit) for faster, higher-fidelity rendering

## Install

```bash
dsh plugin add github:dingweihua/dsh-ppt-kit

# optional: rendering + docx/xlsx/PDF companions
dsh plugin add dsh-office-kit
```

Then **open a new session** — the `/` menu caches the skill catalog per session.

If your DSH version exposes plugins through the desktop UI, install from *Settings → Plugins* using the same GitHub spec.

## Verify

Say *"check the PPT environment"*. The model calls `ppt_kit_doctor`, which returns JSON:

| Field | Expected |
|---|---|
| `ready` | `true` |
| `uv.present` | `true` |
| `slidesCli.present` / `contractVersion` | `true` / `2026.03-alpha` |
| `powerpointMcp.bridgeRegistered` | `true` |
| `companions` → `office-render` | `true` recommended |
| `shadowedSkills` | `[]` |
| `remedies` | `[]` — otherwise follow the commands it prints |

## What you get

**8 skills** — one router plus the upstream workflows, with four documentation bugs corrected against the real CLI (`template_catalog.json` / `content_layout_catalog.json` naming, a non-existent `--layout-preview-dir` flag, and a missing `archetypes_catalog_path` field):

`/ppt` (router) · `/slides-extract` · `/slides-build` · `/slides-edit` · `/slides-audit` · `/slides-critique` · `/slides-polish` · `/slides-full`

**One MCP server** — KitchenSink4PPT, registered as `powerpoint` (9 tools, 145 operations).

**One tool** — `ppt_kit_doctor`, covering uv, the agent-slides CLI, the MCP bridge, LibreOffice, writable uv directories, and skill shadowing.

## Usage

```
You: Build an 8-slide quarterly review from this template
→ extract contract → build → verify

You: The table on slide 4 is cramped — even out the columns, right-align numbers
→ KitchenSink4PPT (ppt_tables), then render a PNG so you can see it

You: Make the tone throughout more conservative
→ /slides-edit text replacement, layout untouched
```

## Troubleshooting

**`uvx` fails with `Could not create temporary file` / EPERM** — the host cannot write `~/.local/share/uv`. Export `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR` and `UV_CACHE_DIR` to a writable path, restart DSH. `ppt_kit_doctor` prints the exact values.

**No `ppt_*` tools at all** — the MCP row did not activate or `uvx kitchensink4ppt` cannot start. Run the doctor. If `uvx` is missing from the PATH that a GUI-launched app inherits, point the `ppt-kit-mcp-powerpoint` row's `command` at the absolute path of this package's `bin/ks4ppt-mcp.sh` and drop `args`; the doctor prints that line for your machine.

**Fixed skill text does not seem to apply** — you have an older copy in `~/.dsh/skills` or `<project>/.dsh/skills`. Those roots outrank bundled skills. Delete the copy; `shadowedSkills` lists them.

**Exports fail** — no LibreOffice. Install it, or set `KS4P_SOFFICE` to the `soffice` executable.

## Structure

```
lib/index.js            skill provider + ppt_kit_doctor
assets/<skill>/SKILL.md 8 skills
cordis.patch.yml        two insert rows: this plugin, MCP server
bin/ks4ppt-mcp.sh       launcher: finds uv, finds soffice, falls back to a writable dir
test/smoke.mjs          stub-context load test
```

## Uninstall

Remove the plugin rows. Skills disappear with the plugin; nothing is left behind in `~/.dsh/skills`. Generated `output/` directories and `.ks4p-backups/` are yours to clean up.

## Development

```bash
npm install     # peer dependencies
npm run smoke   # loads the plugin with a stub context; asserts skills, bodies, doctor output
```

## License

MIT for this plugin. Bundled skill text comes from [agent-slides](https://github.com/mpuig/agent-slides) (MIT); see [NOTICE.md](NOTICE.md) and [LICENSE-agent-slides.txt](LICENSE-agent-slides.txt). KitchenSink4PPT (AGPL-3.0) is **not** bundled — only a launch command is referenced.

---

[中文说明](README.zh.md)
