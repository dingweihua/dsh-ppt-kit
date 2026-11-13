---
name: ppt
description: Orchestrate the three-layer PowerPoint workflow (agent-slides template contracts, KitchenSink4PPT surgical editing, office-* render verification) and route any PPT request to the right tool in the right order. Use when the user wants to make a deck from a company template, edit or fix an existing .pptx, adjust tables/charts/alignment/master slides, check slide layout quality, or asks which PPT tool to use. Triggers on "做PPT", "生成演示文稿", "按模板做", "改一下这页", "表格太挤", "对齐", "导出图片", or any .pptx task where template fidelity and fine editing both matter.
---

# PPT 编排：三层的分工与顺序

这份技能管的不是某一项操作，而是**判断该用哪一层、按什么顺序、哪一步不能做**。三层的能力有重叠，混用会互相覆盖且不报错，所以顺序是硬约束。

## 三层能力与边界

| 层 | 工具 | 独有能力 | 明确不做 |
|---|---|---|---|
| 契约层 | agent-slides | 从模板提取版式/geometric/主题色/字体/archetype（22 个），并按契约生成整份 deck | 不做外科式精修；它的编辑是**重建式**（重新渲染整份） |
| 精修层 | KitchenSink4PPT（MCP，`ppt_*`） | 145 个原子操作：表格合并、图表、母版占位符、连接线粘接、SVG 转原生形状、对齐分布 | 没有模板契约概念；不会替你写故事线 |
| 核验层 | office-* 技能（可选依赖） | 渲染 PNG/PDF、结构校验，自带 LibreOffice 引擎 | 不生成内容 |

**关键差异**：契约层和精修层的编辑模型不兼容。前者重跑一次会把后者改的内容整份覆盖，且不会提示。

## 标准流程

### 第 0 步：环境自检（每次会话的第一次 PPT 任务）

调用 `ppt_kit_doctor`。它的 `ready` 为 false 时，先把 `remedies` 里的命令给用户，不要自行尝试安装。

### 第 1 步：提取模板契约（仅当用户给了模板）

```
uvx --from agent-slides slides extract <模板.pptx> \
  --output-dir output/<项目名> \
  --base-template-out output/<项目名>/base_template.pptx
```

产物以 CLI 实际输出为准：`template_catalog.json`、`content_layout_catalog.json`、`archetypes.json`、`resolved_manifest.json`、`slides_manifest.json`、`slide_analysis.json`、`base_template.pptx`、`slide_screenshots/`。

- 不存在 `--layout-preview-dir`（该版本没有这个参数）。
- 不存在上游文档写的 `content_layout.json` / `template_layout.json`，用上面的真实名字。
- 产出 `icons/` 当且仅当模板页里有 freeform / 组合形状；有就把它填进 profile 的 `icon_pack_dir`，没有就不填。

写完 `design-profile.json` 后，把 `content_layout_catalog_path` 指向 `content_layout_catalog.json`，并加上 `archetypes_catalog_path: "archetypes.json"`。路径写错不会报错，只会让版式映射静默失效。

**先算字号缩放系数，再写任何文字**：

```
缩放系数 = 模板画布宽度(in) / 13.333
```

画布是 13.333×7.5 就按常规字号写；是 26.67×15.0 就把所有字号 ×2。品牌模板常做成标准尺寸的整数倍（2 倍很常见），直接用常规字号会让整页文字显得又小又空，而安全区检查仍然全绿——**检查通过不等于排版好看**。

同理适用于坐标：`editable_regions` 用英寸，画布放大后区域同比放大，不要拿标准尺寸下的经验值去套。

还要看模板是否**真的带文字**：`unzip -p <模板> 'ppt/slides/slide1.xml' | grep -c '<a:t>'`。很多品牌模板是纯视觉版式（样例页一个 `<a:t>` 都没有），此时"贴模板"的含义是"在给定视觉框里自己放字"，唯一定位依据就是 `editable_regions`，不要指望复用标题占位符。

### 第 2 步：生成初稿

按 `/slides-build` 的做法产出 `slides.json` 并渲染成 `draft.pptx`，然后跑一次 `qa`。

### 第 3 步：精修（一旦开始，规则生效）

**进入这一步前，先复制一份**：

```
cp output/<项目名>/draft.pptx output/<项目名>/v2.pptx
```

此后所有编辑都在 `v2.pptx` 上用 `ppt_*` 工具做，**不要再对任何已被 `ppt_*` 改过的文件运行 `slides render` / `slides apply`**——那等于丢弃精修成果。

### 第 4 步：核验并交付

- 结构检查：`ppt_inspect` 的 `check_layout`、`get_autofit_state`、`audit_accessibility`
- 视觉检查：`ppt_deck` 的 `export_slide_image` 出 PNG（或 `office-render`），**把 PNG 交给用户看**
- 你不能读图时，必须明说“以下是我用几何规则查到的，视觉需你确认”，不要假装看过

## 路由表

| 用户意图 | 走哪一层 | 入口 |
|---|---|---|
| 用这个模板做一份 N 页 PPT | 契约层 → 精修层 | `/slides-extract` → `/slides-build` |
| 只改几个字的标题/正文 | 精修层 | `ppt_edit` 的 `apply_edits` / `search_and_replace` |
| 表格太挤、列宽、合并单元格 | 精修层 | `ppt_tables` |
| 图表数据、类型、标签 | 精修层 | `ppt_tables` 的 `update_chart_data` / `format_chart` |
| 对齐、分布、层级、组合 | 精修层 | `ppt_graphics` 的 `align_shapes` / `distribute_shapes` / `set_z_order` |
| 母版、版式、主题色 | 精修层 | `ppt_design` |
| 检查排版有没有溢出/重叠 | 任意 | `ppt_inspect` 的 `check_layout` |
| 故事讲得好不好 | 纯分析 | `/slides-critique`（不改文件） |
| 补备注、来源、收尾 | 纯文本 | `/slides-polish` |
| 导出 PDF / 逐页图片 | 核验层 | `office-render`，没有则 `ppt_deck` 的 `export_slide_image` |
| 不知道环境能不能跑 | 自检 | `ppt_kit_doctor` |

## 硬规则

1. **没有契约不要生成**。没有 `resolved_manifest.json` 就谈“按模板做”，出来的东西一定不贴模板。
2. **契约层与精修层不混跑**。精修开始后，契约层只能读不能写。
3. **不要绕过工具手写 python-pptx 脚本**。那会绕开契约约束和自动备份（`.ks4p-backups/`），出问题无法回退。
4. **每次改动都要核验**。改完至少跑一次 `check_layout`；涉及视觉的加出图。核验全绿只说明"没出界、没重叠"，不说明"排版密度合适"——密度要单独量（最长行占箱宽、文字高占箱高）。
5. **不要动 `.ks4p-backups/`**。那是回滚用的上一版快照。
6. **不承诺你没验证的效果**。尤其是“看起来更好了”这类判断——你没有视觉能力时必须交给用户确认。

## 常见故障与对策

| 现象 | 原因 | 对策 |
|---|---|---|
| `uvx` 报 `Could not create temporary file` / EPERM | 沙箱不允许写 `~/.local/share/uv` | 设 `UV_TOOL_DIR`、`UV_TOOL_BIN_DIR`、`UV_CACHE_DIR` 到可写目录（doctor 会给出具体值） |
| `ppt_*` 工具一个都不存在 | MCP 行没注册或 `uvx kitchensink4ppt` 起不来 | 先跑 `ppt_kit_doctor`，按 `remedies` 处理 |
| 生成的 deck 版式乱、不贴模板 | design profile 的 catalog 路径写错（静默降级） | 检查 `content_layout_catalog_path` 与 `archetypes_catalog_path` 的真实文件名 |
| 版式都对但文字又小又空 | 字号没按画布缩放 | 用 `画布宽 / 13.333` 算上限，取 60%–80% 放大 |
| 字号调完反而"太大" | 把画布倍率当成了字号倍率 | 画布 2 倍只说明设计是 2 倍作图，字号取上限的 60%–80%，出图定档 |
| 精修内容“自己变回去了” | 又跑了一次 `slides render` | 用 `.ks4p-backups/prev` 恢复，然后遵守第 3 步规则 |
| 技能有两个同名版本，改了没生效 | `~/.dsh/skills` 里的旧副本 rank 更高，压过了插件内的 | 删掉旧副本；doctor 的 `shadowedSkills` 会列出来 |
| 导出图片失败 | 没有 LibreOffice | 装 LibreOffice 或设 `KS4P_SOFFICE`；或改用 `office-render` |
