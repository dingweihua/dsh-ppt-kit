# dsh-ppt-kit 中文说明

一个 DSH 插件，把三个能力互补的工具编成一条可重复的 PPT 流程：

```
模板契约提取  →  按契约生成  →  外科式精修  →  渲染核验
agent-slides     agent-slides    KitchenSink4PPT   office-* / KS4PPT
```

插件自身**不含任何 PPT 引擎**。它提供的是单装任一工具都得不到的部分：三个工具之间的边界、必须遵守的先后顺序，以及一个能说清"缺了什么"的自检工具。

> 设计理由、取舍、以及这个插件在什么情况下不再值得用：见 [DESIGN.md](DESIGN.md)。

## 为什么需要编排

| 能力 | agent-slides | KitchenSink4PPT | office-* |
|---|---|---|---|
| 提取模板契约（版式/几何/主题/archetype） | ✅ | ❌ | ❌ |
| 按契约生成 deck | ✅ | ❌ | ⚠️ 通用写入 |
| 外科式精修（145 个原子操作） | ⚠️ 重建式 | ✅ | ⚠️ 基础 |
| 渲染核验 | ⚠️ 粗粒度 | ✅ 需外部 LibreOffice | ✅ 自带引擎 |

没有单一工具能覆盖"贴模板 + 精修 + 可验证"。最危险的接缝是编辑模型：agent-slides **重新渲染整份**，KitchenSink4PPT **就地改那个形状**。精修之后再跑一次渲染，修改会静默消失且不报错。本插件把这条规则写死，而不是指望模型临场判断。

## 前置条件

- DSH `0.2.1` 及以上
- `uv` 在 `PATH` 上（两个工具都是 Python 包，首次运行时拉取）
- 可选：LibreOffice（仅导出 PDF / PNG 需要）
- 可选但建议：[`dsh-office-kit`](https://www.npmjs.com/package/dsh-office-kit)（更快、更准的渲染核验）

## 安装

```bash
dsh plugin add github:dingweihua/dsh-ppt-kit

# 可选：渲染核验 + docx/xlsx/PDF 能力
dsh plugin add dsh-office-kit
```

装完**新开一个会话**——`/` 菜单的技能目录按会话缓存。

桌面端也可以走「设置 → 插件」，用同样的 GitHub 地址安装。

## 验证

在会话里说「检查 PPT 环境」，模型会调用 `ppt_kit_doctor`，返回 JSON：

| 字段 | 期望 |
|---|---|
| `ready` | `true` |
| `uv.present` | `true` |
| `slidesCli.present` / `contractVersion` | `true` / `2026.03-alpha` |
| `powerpointMcp.bridgeRegistered` | `true` |
| `companions` 中 `office-render` | 建议 `true` |
| `shadowedSkills` | `[]` |
| `remedies` | `[]`，非空时按其中命令处理 |

## 安装后得到什么

**8 个技能**——1 个编排 + 7 个上游工作流，并修正了 4 处上游文档与实际 CLI 不符的地方（`template_catalog.json` / `content_layout_catalog.json` 的真实文件名、不存在的 `--layout-preview-dir` 参数、缺失的 `archetypes_catalog_path` 字段）：

`/ppt`（编排）· `/slides-extract` · `/slides-build` · `/slides-edit` · `/slides-audit` · `/slides-critique` · `/slides-polish` · `/slides-full`

**1 个 MCP 服务器**——KitchenSink4PPT，注册为 `powerpoint`（9 个工具、145 个操作）。

**1 个工具**——`ppt_kit_doctor`，检查 uv、agent-slides CLI、MCP 桥、LibreOffice、uv 目录可写性、技能影子冲突。

## 用法示例

```
你：用这个模板做一份 8 页的季度复盘
→ 提取契约 → 生成初稿 → 核验

你：第 4 页那个表太挤，列宽匀一点，数字右对齐
→ 走 KitchenSink4PPT（ppt_tables），改完出 PNG 给你看

你：整份语气改保守一些
→ 走 /slides-edit 的文本替换，不动版式
```

## 常见问题

**`uvx` 报 `Could not create temporary file` / EPERM**——宿主不能写 `~/.local/share/uv`。把 `UV_TOOL_DIR`、`UV_TOOL_BIN_DIR`、`UV_CACHE_DIR` 指到可写目录并重启 DSH；`ppt_kit_doctor` 会给出具体值。

**`ppt_*` 工具一个都没有**——MCP 行没生效，或 `uvx kitchensink4ppt` 起不来。先跑 doctor。若 GUI 启动的 DSH 的 PATH 里没有 `uvx`，把 `ppt-kit-mcp-powerpoint` 行的 `command` 换成包内 `bin/ks4ppt-mcp.sh` 的绝对路径、`args` 清空；doctor 会打印这一行。

**修好的技能文档好像没生效**——你之前手工装过 `slides-*` 到 `~/.dsh/skills` 或项目 `.dsh/skills`，这些根目录的优先级高于插件内的技能。删掉旧副本；doctor 的 `shadowedSkills` 会列出来。

**导出失败**——没有 LibreOffice。装它，或把 `KS4P_SOFFICE` 设为 `soffice` 可执行文件的路径。

## 目录结构

```
lib/index.js            技能 provider + ppt_kit_doctor
assets/<技能>/SKILL.md   8 个技能
cordis.patch.yml        两条 insert 行：本插件、MCP 服务器
bin/ks4ppt-mcp.sh       启动器：找 uv、找 soffice、兜底可写目录
test/smoke.mjs          桩上下文加载测试
```

## 卸载

移除插件的行即可。技能随插件消失，不会残留到 `~/.dsh/skills`。已生成的 `output/` 与 `.ks4p-backups/` 需自行清理。

## 开发

```bash
npm install     # 安装 peer 依赖
npm run smoke   # 用桩上下文加载插件，断言技能、正文与 doctor 输出
```

## 许可

本插件 MIT。随包分发的技能文本来自 [agent-slides](https://github.com/mpuig/agent-slides)（MIT），见 [NOTICE.md](NOTICE.md) 与 [LICENSE-agent-slides.txt](LICENSE-agent-slides.txt)。KitchenSink4PPT（AGPL-3.0）**未打包**，仅引用其启动命令。
