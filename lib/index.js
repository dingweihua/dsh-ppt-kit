/**
 * dsh-ppt-kit — skill provider + environment doctor for the PowerPoint workflow.
 *
 * Shape follows the first-party `@deepseek-ai/dsh-skill-office` package: skills
 * live as Markdown under `assets/<name>/SKILL.md` and are published through
 * `ctx.skills.registerProvider`, so they disappear cleanly when the plugin is
 * removed instead of lingering in `~/.dsh/skills`.
 *
 * @module dsh-ppt-kit
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
import { defineTool } from "@deepseek-ai/dsh-tools";

const execFileAsync = promisify(execFile);

/** Cordis plugin identity. */
const name = "ppt-kit";

/** Services this plugin registers into. */
const inject = ["skills", "tools"];

/** Skills shipped in this package, in menu order. */
const SKILL_NAMES = [
	"ppt",
	"slides-extract",
	"slides-build",
	"slides-edit",
	"slides-audit",
	"slides-critique",
	"slides-polish",
	"slides-full"
];

/** Skills owned by other providers that this kit's workflow builds on. */
const COMPANION_SKILLS = ["office-render", "office-pptx", "office-presentations"];

const PACKAGE_ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const ASSET_ROOT = join(PACKAGE_ROOT, "assets");
const LAUNCHER = join(PACKAGE_ROOT, "bin", "ks4ppt-mcp.sh");

/** Detect a YAML frontmatter block and return its description plus the body. */
function parseSkill(raw, path) {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
	if (frontmatter?.[1] === void 0) throw new Error(`ppt-kit: ${path} has no YAML frontmatter`);
	const description = /^description:\s*(.+)$/mu.exec(frontmatter[1])?.[1]?.trim();
	if (description === void 0 || description.length === 0) {
		throw new Error(`ppt-kit: ${path} has no description`);
	}
	return { description, content: raw.slice(frontmatter[0].length).trim() };
}

/** Appended to every skill body so the model always knows how to self-check. */
const RUNTIME_NOTE = `

## ppt-kit runtime

This skill ships with the \`dsh-ppt-kit\` plugin. Before the first PPT task in a
session — or whenever a tool call fails with a missing dependency — call the
\`ppt_kit_doctor\` tool. It reports uv, the agent-slides CLI, the KitchenSink4PPT
MCP bridge, LibreOffice, and whether companion \`office-*\` skills are installed,
and prints copy-paste remedies. Do not guess at a missing dependency.
`;

/** Build the provider with one candidate per shipped skill. */
function createProvider() {
	const candidates = SKILL_NAMES.map((skillName) => {
		const directory = join(ASSET_ROOT, skillName);
		const path = join(directory, "SKILL.md");
		const { description } = parseSkill(readFileSync(path, "utf8"), path);
		return {
			name: skillName,
			description,
			invocation: {
				modelInvocable: true,
				userInvocable: true
			},
			provider: "ppt-kit",
			source: "bundled",
			rank: BUNDLED_SKILL_RANK,
			resourceBase: {
				kind: "directory",
				path: directory.split(sep).join("/")
			},
			locator: path
		};
	});
	return {
		name: "ppt-kit",
		list: () => Promise.resolve(candidates),
		get(candidate) {
			const { rank: _rank, locator, ...summary } = candidate;
			const { content } = parseSkill(readFileSync(locator, "utf8"), locator);
			return Promise.resolve({ ...summary, content: content + RUNTIME_NOTE });
		}
	};
}

/** Run a command with a hard timeout; never throws. */
async function probe(command, args, timeoutMs = 20_000) {
	try {
		const { stdout, stderr } = await execFileAsync(command, args, {
			timeout: timeoutMs,
			maxBuffer: 4 * 1024 * 1024,
			env: process.env
		});
		return { ok: true, output: `${stdout}${stderr}`.trim() };
	} catch (error) {
		const output = `${error?.stdout ?? ""}${error?.stderr ?? ""}`.trim();
		return {
			ok: false,
			output,
			code: error?.code ?? null,
			reason: error?.code === "ENOENT" ? "not installed or not on PATH" : (error?.message ?? String(error))
		};
	}
}

/** True when the directory can be created and written to. */
function isWritable(directory) {
	try {
		mkdirSync(directory, { recursive: true });
		const probeFile = join(directory, `.ppt-kit-probe-${process.pid}`);
		writeFileSync(probeFile, "");
		unlinkSync(probeFile);
		return true;
	} catch {
		return false;
	}
}

/** LibreOffice candidates, most specific first. */
function sofficeCandidates() {
	return [
		process.env.KS4P_SOFFICE,
		"/Applications/LibreOffice.app/Contents/MacOS/soffice",
		"/usr/bin/soffice",
		"/usr/local/bin/soffice",
		"/opt/homebrew/bin/soffice"
	].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
}

/**
 * Register the skills and the doctor tool.
 * @param ctx - Context carrying the skill and tool registries.
 */
function apply(ctx) {
	const provider = createProvider();
	ctx.effect(() => ctx.skills.registerProvider(() => provider), "ppt-kit: skills");

	// Session cache: the CLI probe costs seconds, the doctor may be called twice.
	let slidesProbe;
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "ppt_kit_doctor",
		description: "Report whether the dsh-ppt-kit PowerPoint workflow can run here: uv, the agent-slides CLI, the KitchenSink4PPT MCP bridge, LibreOffice, writable uv directories, duplicate skill sources, and companion office-* skills. Call before the first PPT task, or when a PPT tool call fails with a missing dependency. Returns JSON with copy-paste remedies.",
		parameters: {},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{ type: "text", text: value }]
		},
		timeoutMs: 300_000,
		async execute() {
			const uvx = await probe("uvx", ["--version"]);
			if (slidesProbe === void 0) {
				slidesProbe = await probe("uvx", ["--from", "agent-slides", "slides", "version"], 180_000);
			}
			const slides = slidesProbe;
			let contractVersion;
			try {
				contractVersion = JSON.parse(slides.output.slice(slides.output.indexOf("{"))).contract_version;
			} catch {
				contractVersion = void 0;
			}

			const uvToolDir = process.env.UV_TOOL_DIR ?? join(homedir(), ".local", "share", "uv", "tools");
			const catalog = await ctx.skills.list({ cwd: process.cwd() }).catch(() => []);
			const byName = new Map(catalog.map((skill) => [skill.name, skill]));
			const shadowed = SKILL_NAMES
				.filter((skillName) => {
					const found = byName.get(skillName);
					return found !== void 0 && found.provider !== "ppt-kit";
				})
				.map((skillName) => ({
					skill: skillName,
					provider: byName.get(skillName).provider,
					path: byName.get(skillName).locator ?? null,
					note: "a higher-ranked copy wins over the plugin's copy; remove it to use this package's version"
				}));
			const companions = COMPANION_SKILLS.map((skillName) => ({
				skill: skillName,
				present: byName.has(skillName),
				provider: byName.get(skillName)?.provider ?? null
			}));
			const mcpToolPresent = ctx.tools.get("mcp__powerpoint__ppt_help") !== void 0;

			const soffice = sofficeCandidates().find((candidate) => existsSync(candidate)) ?? null;
			const remedies = [];
			if (!uvx.ok) {
				remedies.push("Install uv: https://docs.astral.sh/uv/ — then reopen DSH so PATH is reloaded.");
			}
			if (!slides.ok) {
				remedies.push("Run `uvx --from agent-slides slides version` in a terminal and read the error; the first run downloads the package.");
			}
			if (uvx.ok && !isWritable(uvToolDir)) {
				remedies.push(`UV_TOOL_DIR (${uvToolDir}) is not writable. Export UV_TOOL_DIR and UV_TOOL_BIN_DIR to a writable directory before starting DSH, e.g. UV_TOOL_DIR=\"$HOME/.dsh-ppt-kit/uv/tools\" UV_TOOL_BIN_DIR=\"$HOME/.dsh-ppt-kit/uv/bin\".`);
			}
			if (!mcpToolPresent) {
				remedies.push(`The PowerPoint MCP bridge is not registered. Check that profile row ppt-kit-mcp-powerpoint exists and that \`uvx kitchensink4ppt\` runs. If the plain command fails, replace its command with this package's launcher:\n  command: ${LAUNCHER.split(sep).join("/")}\n  args: []`);
			}
			if (soffice === null) {
				remedies.push("LibreOffice was not found. It is only needed for PDF and slide-image export. Install it, or set KS4P_SOFFICE to the soffice executable.");
			}
			if (shadowed.length > 0) {
				remedies.push(`Duplicate skill sources shadow this package: ${shadowed.map((entry) => entry.skill).join(", ")}. Delete those directories (usually under ~/.dsh/skills or <project>/.dsh/skills) so the plugin's corrected copies are used.`);
			}
			if (companions.some((entry) => entry.skill === "office-render" && !entry.present)) {
				remedies.push("The optional dsh-office-kit plugin is not installed. Rendering then falls back to KitchenSink4PPT's export. Install it for faster, higher-fidelity render checks.");
			}

			const report = {
				plugin: {
					name,
					version: JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version,
					root: PACKAGE_ROOT,
					skills: SKILL_NAMES
				},
				runtime: {
					node: process.version,
					platform: `${process.platform}-${process.arch}`,
					cwd: process.cwd()
				},
				uv: {
					present: uvx.ok,
					version: uvx.ok ? uvx.output.split("\n")[0] : null,
					toolDir: uvToolDir,
					toolDirWritable: isWritable(uvToolDir)
				},
				slidesCli: {
					present: slides.ok,
					contractVersion: contractVersion ?? null,
					output: slides.ok ? void 0 : slides.output.slice(0, 800),
					reason: slides.ok ? void 0 : slides.reason
				},
				powerpointMcp: {
					bridgeRegistered: mcpToolPresent,
					launcher: LAUNCHER.split(sep).join("/"),
					launcherExists: existsSync(LAUNCHER)
				},
				libreoffice: {
					present: soffice !== null,
					path: soffice,
					envSet: typeof process.env.KS4P_SOFFICE === "string"
				},
				companions,
				shadowedSkills: shadowed,
				remedies,
				ready: uvx.ok && slides.ok && mcpToolPresent
			};
			return JSON.stringify(report, null, 2);
		}
	})), "ppt-kit: doctor");
}

export { apply, inject, name };
