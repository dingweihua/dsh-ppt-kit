---
name: slides-extract
description: Extract template contracts from a .pptx file. Produces layout catalogs, archetypes, resolved manifest, and a clean base template for slides-build. Use when the user provides a PowerPoint template, says "use this template", "extract layouts", "analyze this pptx", or wants to prepare a template before building slides.
compatibility: Requires Python 3.12+ and uv.
---

# Slides Extract

> **Environment note.** `uvx` needs writable tool and cache directories. Where `~/.local/share/uv` is not writable (the DSH file sandbox, CI containers, locked-down machines), export `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR` and `UV_CACHE_DIR` to a writable path first, e.g. `export UV_TOOL_DIR=$PWD/.uv/tools UV_TOOL_BIN_DIR=$PWD/.uv/bin UV_CACHE_DIR=$PWD/.uv/cache`. On macOS LibreOffice has no well-known path; set `KS4P_SOFFICE=/Applications/LibreOffice.app/Contents/MacOS/soffice` for the MCP server.


You are a template analyst. Your job is to extract structured contracts from PowerPoint templates so that downstream skills can generate pixel-perfect decks without guessing.

Extract template contracts from a `.pptx` template or sample deck.

## When to Use

- Before the first `/slides-build` for a given template
- When the source template changes
- When you need to analyze a template's layouts and capabilities

## Prerequisites

- A `.pptx` file (template or sample deck with example slides)

## Process

### Step 1) Create project directory

Create a dedicated directory for this project's artifacts:

```bash
mkdir -p output/<project-name>
```

All subsequent commands and outputs go in this directory.

### Step 2) Run extraction

Use `uvx --from agent-slides slides docs method:extract` to verify the current contract, then:

```bash
uvx --from agent-slides slides extract <template_or_sample.pptx> \
  --output-dir output/<project> \
  --base-template-out output/<project>/base_template.pptx \
  --compact
```

There is no `--layout-preview-dir` flag in this release (`slides extract --help` lists only
`--output-dir`, `--base-template-out`, `--fields`, `--ndjson`, `--verbose`, `--compact`). Slide
screenshots are written to `slide_screenshots/` unconditionally.

### Step 3) Verify outputs

| Artifact | Purpose |
|---|---|
| `template_catalog.json` | Physical layout families, placeholders, geometry |
| `content_layout_catalog.json` | Archetype-to-layout compatibility map |
| `archetypes.json` | Available archetypes with usage constraints |
| `resolved_manifest.json` | Merged contract — theme palette, per-archetype resolved layout bindings. Primary reference for `/slides-build`. |
| `slides_manifest.json` | Slide-by-slide inventory of the source |
| `slide_analysis.json` | Deep per-slide structural analysis |
| `slide_screenshots/` | Visual reference screenshots |
| `base_template.pptx` | Clean `.pptx` — all masters/layouts/theme, zero content slides |

### Step 4) Comprehension gate

Read `resolved_manifest.json` and verify you can answer these questions before proceeding:

- What accent colors does the theme use? List the hex values. (Path: `theme.palette.accent1` … `accent6`)
- How many archetypes have `resolved_layouts`? Name them. (Note: `archetypes` is a **dict keyed by archetype ID**, not a list — iterate with `for aid, arch in archetypes.items()`)
- Which layouts are split-panel (title in a side zone)?
- What `text_color` does each color zone use?

If any answer is unclear, re-read the manifest. Do not proceed to the design profile until all four are answered.

### Step 5) Build design profile

Write `design-profile.json` in the project directory:

```json
{
  "name": "<project-name>",
  "template_path": "base_template.pptx",
  "content_layout_catalog_path": "content_layout_catalog.json",
  "archetypes_catalog_path": "archetypes.json"
}
```

Add these fields from the extracted theme:

| Field | Source | Purpose |
|---|---|---|
| `primary_color_hex` | Theme accent1 | Brand accent color for subheadings |
| `text_color_light` | Theme lt1 | Light text for dark backgrounds |
| `text_color_dark` | Theme dk1 | Dark text for light backgrounds |
| `default_font_size_pt` | Template body size | Default for `add_text` |
| `archetypes_catalog_path` | `archetypes.json` | Archetype constraints for the build stage |

Always use `base_template.pptx` (not the original) as `template_path`.

If extract produced an `icons/` directory (it does so when the template's slides contain freeform or grouped shapes), point `icon_pack_dir` at it so `add_icon` reuses the template's own shapes. Otherwise leave `icon_pack_dir` unset: the built-in icon library is what `add_icon` uses. (`icon_pack_dir` stays a valid schema field for a hand-built pack.)

**Only add fields listed above or in the schema.** The profile uses `extra="forbid"` — any unknown field (e.g., `secondary_color_hex`, `accent_color_hex`, `font_name`) causes a validation error.

Use `uvx --from agent-slides slides docs schema:design-profile` for the full schema.

## Outputs

This skill produces the project directory consumed by all other slides skills:

- `base_template.pptx` + contract JSONs -> `/slides-build`
- `design-profile.json` -> all post-build skills

## Error Handling

On any slides error, run `uvx --from agent-slides slides docs method:extract` to verify the current contract before retrying.

## Acceptance Criteria

1. All artifact files exist and are valid JSON (where applicable).
2. `resolved_manifest.json` contains at least one archetype with resolved layouts.
3. `base_template.pptx` opens without errors.
4. `design-profile.json` references `base_template.pptx` and `content_layout.json`.
5. Comprehension gate questions answered correctly.
