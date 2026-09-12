import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  begin,
  DEFAULTS,
  distribution,
  memory,
  preset,
  tokenize,
} from "./sim.ts";
import type { Settings } from "./sim.ts";

function complete(settings: Settings) {
  let run = begin("How does an AI generate an answer?", settings);
  for (let i = 0; i < 1000 && run.phase !== "done"; i++)
    run = advance(run, settings);
  assert.equal(run.phase, "done");
  return run;
}
test("prompt tokenization is deterministic, preserves Unicode, and rejects empty input", () => {
  assert.deepEqual(
    tokenize("Hello, 世界!").map((token) => token.text),
    ["Hello", ",", "世界", "!"],
  );
  assert.deepEqual(tokenize("A test"), tokenize("A test"));
  assert.equal(begin("   ", DEFAULTS).phase, "idle");
});
test("a prompt visits every inference stage before emitting a token", () => {
  let run = begin("Build a voxel world", DEFAULTS);
  for (const expected of [
    "tokenize",
    "embed",
    "attention",
    "ffn",
    "sample",
    "emit",
  ]) {
    assert.equal(run.phase, expected);
    assert.equal(run.output.length, expected === "emit" ? 1 : 0);
    run = advance(run, DEFAULTS);
  }
  assert.equal(run.output.length, 1);
  assert.equal(run.phase, "attention");
});
test("sampling normalizes probabilities and temperature/top-k change the distribution", () => {
  const cold = distribution(["a", "b", "c"], 0.2, 3);
  const hot = distribution(["a", "b", "c"], 2, 3);
  assert.ok(cold[0].probability > hot[0].probability);
  assert.ok(
    Math.abs(hot.reduce((sum, value) => sum + value.probability, 0) - 1) <
      1e-10,
  );
  assert.deepEqual(distribution(["a", "b"], 0, 2), [
    { text: "a", probability: 1 },
    { text: "b", probability: 0 },
  ]);
  assert.deepEqual(distribution(["a", "b"], 1, 1), [
    { text: "a", probability: 1 },
  ]);
});
test("paged allocation rounds tokens into pages and GQA reduces KV slots fourfold", () => {
  const run = begin("one two three four five", DEFAULTS);
  const paged = memory(run, { ...DEFAULTS, paged: true, gqa: false });
  const naive = memory(run, { ...DEFAULTS, paged: false, gqa: false });
  const grouped = memory(run, { ...DEFAULTS, paged: true, gqa: true });
  assert.ok(paged.reserved < naive.reserved);
  assert.equal(paged.reserved, grouped.reserved * 4);
  assert.equal(paged.used, grouped.used * 4);
  assert.ok(
    paged.blocks.every((block) => block.tokens >= 0 && block.tokens <= 4),
  );
});
test("continuous batching admits a waiting request before the slowest active request ends", () => {
  const base = { ...DEFAULTS, maxTokens: 16, batchSize: 2 };
  let continuous = begin("test prompt", base);
  let staticBatch = begin("test prompt", { ...base, continuous: false });
  for (let i = 0; i < 26; i++) {
    continuous = advance(continuous, base);
    staticBatch = advance(staticBatch, { ...base, continuous: false });
  }
  assert.equal(continuous.jobs[0].status, "active");
  assert.equal(continuous.jobs[2].status, "active");
  assert.equal(staticBatch.jobs[2].status, "waiting");
});
test("speculative verification preserves target output, rejects drafts, and reduces target passes", () => {
  const reference = complete({ ...DEFAULTS, speculative: false });
  const speculative = complete({ ...DEFAULTS, speculative: true });
  assert.deepEqual(speculative.output, reference.output);
  assert.equal(speculative.output.length, DEFAULTS.maxTokens);
  assert.ok(speculative.rejected > 0);
  assert.ok(speculative.accepted > 0);
  assert.ok(speculative.passes < reference.passes);
});
test("engine presets alter real simulation switches and output limits are honored", () => {
  assert.deepEqual(preset("reference"), {
    engine: "reference",
    paged: false,
    gqa: false,
    continuous: false,
    speculative: false,
  });
  assert.equal(preset("speculative").speculative, true);
  for (const maxTokens of [8, 16, 24, 32]) {
    const run = complete({ ...DEFAULTS, maxTokens, speculative: true });
    assert.equal(run.output.length, maxTokens);
    assert.equal(run.jobs[0].status, "done");
  }
});
