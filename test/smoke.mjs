/**
 * Smoke test: load the plugin with a stub context, then exercise the skill
 * provider and the doctor tool. Verifies the ESM shape, every shipped
 * SKILL.md, the appended runtime note, and that the doctor returns parseable
 * JSON — without needing a running DSH.
 *
 * Run from the package root after installing peers: `npm run smoke`.
 */
import assert from "node:assert/strict";
import { apply, inject, name } from "../lib/index.js";

const registeredProviders = [];
const registeredTools = [];
const effects = [];

const ctx = {
	effect(run, label) {
		const dispose = run();
		effects.push({ label, dispose });
	},
	skills: {
		registerProvider(factory) {
			registeredProviders.push(factory());
			return () => {};
		},
		async list() {
			// Pretend a user copy shadows this package, and that office-render exists.
			return [
				{ name: "ppt", provider: "filesystem" },
				{ name: "office-render", provider: "dsh-office" }
			];
		}
	},
	tools: {
		register(definition) {
			registeredTools.push(definition);
			return () => {};
		},
		get(toolName) {
			return toolName === "mcp__powerpoint__ppt_help" ? { name: toolName } : undefined;
		}
	}
};

apply(ctx);

assert.equal(name, "ppt-kit", "plugin name");
assert.deepEqual(inject, ["skills", "tools"], "declared services");
assert.equal(registeredProviders.length, 1, "one skill provider");
assert.equal(registeredTools.length, 1, "one tool");
assert.equal(effects.length, 2, "two effects registered");

const provider = registeredProviders[0];
const candidates = await provider.list();
assert.equal(candidates.length, 8, "eight shipped skills");
for (const candidate of candidates) {
	assert.ok(candidate.description.length > 0, `${candidate.name} has a description`);
	assert.equal(candidate.provider, "ppt-kit");
	assert.equal(candidate.rank, 600);
	assert.equal(candidate.source, "bundled");
	assert.ok(candidate.invocation.modelInvocable && candidate.invocation.userInvocable);
}

const loaded = await provider.get(candidates[0]);
assert.ok(loaded.content.length > 100, "skill body loaded");
assert.ok(loaded.content.includes("ppt-kit runtime"), "runtime note appended");
assert.equal(loaded.rank, undefined, "rank stripped from the definition");
assert.equal(loaded.locator, undefined, "locator stripped from the definition");

const doctor = registeredTools[0];
assert.equal(doctor.name, "ppt_kit_doctor", "tool name");
const report = JSON.parse(await doctor.execute({}, { signal: new AbortController().signal }));
assert.ok(report.plugin.version.length > 0, "plugin version reported");
assert.equal(report.plugin.skills.length, 8);
assert.equal(typeof report.uv.present, "boolean");
assert.equal(typeof report.powerpointMcp.bridgeRegistered, "boolean");
assert.ok(Array.isArray(report.remedies), "remedies is a list");
assert.equal(report.shadowedSkills.length, 1, "shadowing detected");
assert.equal(report.shadowedSkills[0].skill, "ppt");
assert.ok(report.companions.some((entry) => entry.skill === "office-render" && entry.present));

console.log(JSON.stringify(report, null, 2));
console.log("\nsmoke: ok");
