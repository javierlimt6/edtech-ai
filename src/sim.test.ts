import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  elapse,
  completeStage,
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
  assert.equal(run.phase, "embed");
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
  assert.ok(speculative.work.drafted > speculative.work.verified);
  assert.ok(speculative.passes < reference.passes);
});
test("engine presets alter real simulation switches and output limits are honored", () => {
  assert.deepEqual(preset("reference"), {
    engine: "reference",
    kvCache: true,
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

test("every optimization combination finishes all requests with identical target output", () => {
  const expected = complete(DEFAULTS).output;
  const keys = [
    "kvCache",
    "paged",
    "gqa",
    "continuous",
    "speculative",
  ] as const;
  for (let mask = 0; mask < 32; mask++) {
    const settings = { ...DEFAULTS };
    keys.forEach((key, i) => {
      settings[key] = Boolean(mask & (1 << i));
    });
    let run = begin("How does an AI generate an answer?", settings);
    let previous = run;
    for (let i = 0; i < 1000 && run.phase !== "done"; i++) {
      run = advance(run, settings);
      for (const key of Object.keys(run.work) as (keyof typeof run.work)[]) {
        assert.ok(
          Number.isFinite(run.work[key]) && run.work[key] >= previous.work[key],
          `${mask}: ${key}`,
        );
      }
      assert.ok(
        run.jobs.filter((j) => j.status === "active").length <=
          settings.batchSize,
      );
      if (!settings.kvCache) assert.equal(memory(run, settings).reserved, 0);
      previous = run;
    }
    assert.equal(run.phase, "done", `combination ${mask}`);
    assert.ok(
      run.jobs.every(
        (job) => job.status === "done" && job.generated === job.target,
      ),
    );
    assert.deepEqual(run.output, expected);
    assert.equal(
      run.work.idleLanes + run.work.occupiedLanes,
      run.work.laneSteps,
    );
    assert.ok(run.work.drafted >= run.work.verified);
    assert.equal(run.accepted + run.rejected, run.work.verified);
    if (!settings.kvCache) assert.equal(run.work.peakReserved, 0);
  }
});

test("cache-off recomputes increasingly long context; caching processes only fresh positions", () => {
  const cached = complete({ ...DEFAULTS, kvCache: true, speculative: false });
  const uncached = complete({
    ...DEFAULTS,
    kvCache: false,
    speculative: false,
  });
  const n = DEFAULTS.maxTokens;
  assert.equal(cached.work.processed, cached.tokens.length + n - 1);
  assert.equal(cached.work.recomputed, 0);
  assert.equal(
    uncached.work.processed,
    n * uncached.tokens.length + (n * (n - 1)) / 2,
  );
  assert.equal(
    uncached.work.recomputed,
    uncached.work.processed - cached.work.processed,
  );
  assert.deepEqual(cached.output, uncached.output);
  assert.equal(cached.work.cacheReads, uncached.work.recomputed);
});

test("static batching exposes more idle lane steps and workload continues beyond prompt completion", () => {
  const settings = {
    ...DEFAULTS,
    continuous: false,
    maxTokens: 8,
    batchSize: 2,
  };
  let run = begin("test", settings);
  while (run.output.length < settings.maxTokens) run = advance(run, settings);
  assert.notEqual(run.phase, "done");
  assert.ok(run.jobs.some((job) => job.status !== "done"));
  const staticRun = complete({ ...DEFAULTS, continuous: false, batchSize: 2 });
  const continuous = complete({ ...DEFAULTS, continuous: true, batchSize: 2 });
  assert.ok(staticRun.work.idleLanes > continuous.work.idleLanes);
});

test("playback commits only at stage completion; stepping and playback agree", () => {
  const start = begin("a small prompt", DEFAULTS);
  const split = elapse(start, DEFAULTS, 1.5);
  assert.equal(split.phase, "embed");
  assert.equal(split.progress, 0.5);
  assert.equal(split.work.processed, 0);
  const finished = elapse(split, DEFAULTS, 0.5);
  assert.equal(finished.progress, 1);
  assert.equal(finished.work.processed, 3);
  assert.deepEqual(finished, advance(start, DEFAULTS));
  assert.deepEqual(completeStage(finished, DEFAULTS), finished);
  assert.equal(elapse(finished, DEFAULTS, 0), finished);
  assert.deepEqual(
    elapse(start, DEFAULTS, 6),
    elapse(elapse(start, DEFAULTS, 2), DEFAULTS, 4),
  );
  const beforeEmit = elapse(start, DEFAULTS, 5.5);
  assert.equal(beforeEmit.phase, "emit");
  assert.equal(beforeEmit.output.length, 0);
  assert.equal(elapse(beforeEmit, DEFAULTS, 0.5).output.length, 1);
  let stepped = start;
  while (stepped.phase !== "done") stepped = advance(stepped, DEFAULTS);
  assert.deepEqual(elapse(start, DEFAULTS, 500), stepped);
  assert.equal(elapse(start, DEFAULTS, 500).phase, "done");
});

test("inspection and token identity follow decoding and workload draining", async () => {
  const { inspect, flowTokens } = await import("./flow.ts");
  let run = elapse(begin("test prompt", DEFAULTS), DEFAULTS, 5.5);
  const arriving = flowTokens(run, DEFAULTS)[0];
  run = elapse(run, DEFAULTS, 0.6);
  assert.equal(run.phase, "embed");
  assert.deepEqual(flowTokens(run, DEFAULTS)[0], arriving);
  assert.equal(inspect("embed", run, DEFAULTS).status, "Active");
  assert.equal(
    inspect("cache", run, { ...DEFAULTS, kvCache: false }).status,
    "Disabled",
  );
  const settings = {
    ...DEFAULTS,
    maxTokens: 8,
    continuous: false,
    batchSize: 2,
  };
  run = begin("test", settings);
  while (run.output.length < settings.maxTokens) run = advance(run, settings);
  run = advance(run, settings);
  assert.equal(run.phase, "embed");
  assert.equal(inspect("embed", run, settings).status, "Active");
  assert.match(inspect("embed", run, settings).detail, /workload requests/);
  assert.equal(
    inspect("draft", run, { ...settings, speculative: true }).status,
    "Completed",
  );
});

test("requests retain their lanes until completion and new requests fill the actual gap", () => {
  const settings = { ...DEFAULTS, batchSize: 3 };
  let run = begin("test", settings);
  while (run.jobs[1].status !== "done") run = advance(run, settings);
  assert.equal(run.jobs[0].lane, 0);
  assert.equal(run.jobs[2].lane, 2);
  assert.equal(run.jobs[3].lane, 1);
  assert.equal(run.jobs[1].lane, null);
  let staticRun = begin("test", { ...settings, continuous: false });
  while (staticRun.jobs[1].status !== "done")
    staticRun = advance(staticRun, { ...settings, continuous: false });
  assert.equal(staticRun.jobs[2].lane, 2);
  assert.ok(!staticRun.jobs.some((job) => job.lane === 1));
});

// The teaching trace must preserve engine outcomes while exposing earlier boundaries.
import { buildTrace, traceFrame, occurrence, PARTS, enabledPart } from './trace.ts';
test('operation traces preserve engine outcomes for every optimization combination', () => {
  for (let mask = 0; mask < 32; mask++) {
    const settings = { ...DEFAULTS, maxTokens: 8, kvCache: !!(mask & 1), paged: !!(mask & 2), gqa: !!(mask & 4), continuous: !!(mask & 8), speculative: !!(mask & 16) };
    const prompt = 'How does an AI generate an answer?';
    const trace = buildTrace(prompt, settings);
    assert.deepEqual(trace.final, complete(settings));
    const last = trace.events.at(-1)!.after;
    assert.deepEqual(last.output, trace.final.output);
    assert.deepEqual(last.jobs, trace.final.jobs);
    assert.deepEqual(last.work, trace.final.work);
    assert.equal(last.accepted, trace.final.accepted);
    assert.equal(last.rejected, trace.final.rejected);
    assert.ok(trace.events.every(e => enabledPart(PARTS.find(p => p.id === e.part)!, settings)));
  }
});
test('traces are deterministic and seeking restores snapshots without committing twice', () => {
  const trace = buildTrace('Hello, 世界!', { ...DEFAULTS, maxTokens: 8 });
  assert.deepEqual(trace, buildTrace('Hello, 世界!', { ...DEFAULTS, maxTokens: 8 }));
  const append = trace.events.find(e => e.part === 'answer')!;
  const before = structuredClone(traceFrame(trace, append.id));
  assert.equal(traceFrame(trace, append.id + .99).run.output.length, 0);
  assert.equal(traceFrame(trace, append.id + 1).run.output.length, 1);
  traceFrame(trace, trace.events.length);
  assert.deepEqual(traceFrame(trace, append.id), before);
  assert.equal(traceFrame(trace, append.id + 1).run.output.length, 1);
  assert.equal(traceFrame(trace, -2).index, 0);
  assert.equal(traceFrame(trace, Infinity).run.phase, 'done');
  assert.equal(occurrence(trace, 'answer', append.id, -1), undefined);
  assert.ok(occurrence(trace, 'answer', append.id, 1)! > append.id);
});
test('operations reveal token IDs, sampling and lane changes at their own boundaries', () => {
  const trace = buildTrace('Hello world', { ...DEFAULTS, speculative: true, maxTokens: 8 });
  const stamp = trace.events.find(e => e.part === 'stamp')!;
  assert.equal(stamp.before.tokens.length, 0);
  assert.equal(stamp.after.tokens.length, 1);
  const lookup = trace.events.find(e => e.part === 'lookup')!;
  assert.equal(lookup.after.work.processed, lookup.before.work.processed + 1);
  const append = trace.events.find(e => e.part === 'answer')!;
  assert.deepEqual(append.before.jobs, append.after.jobs);
  const release = trace.events.find(e => e.part === 'release' && e.after.jobs.some(j => j.status === 'done'))!;
  assert.ok(release.after.jobs.filter(j => j.status === 'done').every(j => j.lane === null));
  const verify = trace.events.find(e => e.part === 'verify')!;
  assert.equal(verify.after.work.verified, verify.before.work.verified + 1);
  assert.ok(trace.events.some(e => e.part === 'reject'));
  const noCache = buildTrace('Hello', { ...DEFAULTS, kvCache: false });
  assert.ok(noCache.events.every(e => e.station !== 'cache'));
  assert.equal(buildTrace(' ', DEFAULTS).events.length, 0);
});
test('KV storage appears at allocation and rewinds with the rest of the trace', () => {
  const trace = buildTrace('Hello', DEFAULTS);
  const allocate = trace.events.find(e => e.part === 'pages')!;
  assert.equal(allocate.cacheBefore.reserved, 0);
  assert.ok(allocate.cacheAfter.reserved > 0);
  assert.equal(traceFrame(trace, allocate.id).cache!.reserved, 0);
  assert.equal(traceFrame(trace, allocate.id + 1).cache!.reserved, allocate.cacheAfter.reserved);
  assert.equal(traceFrame(trace, trace.events.length).cache!.reserved, 0);
  const contiguous = buildTrace('Hello', { ...DEFAULTS, paged: false });
  const store = contiguous.events.find(e => e.part === 'store')!;
  assert.equal(store.cacheBefore.reserved, 0);
  assert.ok(store.cacheAfter.reserved > 0);
});

test('attention executes all heads in one rewindable event with correct KV sharing', () => {
  for (const gqa of [false, true]) {
    const trace = buildTrace('Parallel heads', { ...DEFAULTS, gqa });
    const queries = trace.events.filter(e => e.part === 'queries');
    assert.ok(queries.length > 0);
    for (const event of queries) {
      assert.deepEqual(event.heads, Array.from({ length: 8 }, (_, i) => ({ query: i + 1, kv: gqa ? Math.floor(i / 4) + 1 : i + 1 })));
      assert.equal(trace.events.filter(e => e.pass === event.pass && e.part === 'queries').length, 1);
      assert.equal(trace.events[event.id + 1].part, 'mix');
      assert.deepEqual(traceFrame(trace, event.id + 0.5).event?.heads, event.heads);
      traceFrame(trace, trace.events.length);
      assert.deepEqual(traceFrame(trace, event.id).event?.heads, event.heads);
    }
  }
});


test('carried subjects preserve token identity through lookup and append', () => {
  const trace = buildTrace('First second', { ...DEFAULTS, speculative: true });
  const stamps = trace.events.filter(e => e.part === 'stamp');
  const lookups = trace.events.filter(e => e.part === 'lookup' && e.pass === 1);
  assert.deepEqual(lookups.map(e => e.subjects), stamps.map(e => e.subjects));
  for (const event of trace.events.filter(e => e.part === 'answer')) {
    assert.equal(event.subjects.length, 1);
    assert.equal(event.subjects[0].text, event.input);
    assert.equal(event.subjects[0].key, `out-${event.before.output.length}`);
  }
});


test('parallel feature lanes occupy distinct, evenly spaced vertical floors', async () => {
  const { featureLane, FACTORY } = await import('./layout.ts');
  const { partPosition } = await import('./trace.ts');
  const lanes = Array.from({ length: 32 }, (_, i) => featureLane('ffn', i));
  assert.equal(new Set(lanes.map(l => `${l.x},${l.y},${l.z}`)).size, 32);
  const heights = [...new Set(lanes.map(l => l.y))];
  assert.equal(heights.length, 4);
  for (const height of heights) assert.equal(lanes.filter(l => l.y === height).length, 8);
  assert.ok(heights.slice(1).every((height, i) => height - heights[i] >= 6));
  assert.equal(new Set(Array.from({ length: 8 }, (_, i) => featureLane('attention', i).y)).size, 2);
  for (const part of PARTS) assert.equal(partPosition(part.id)[1], FACTORY[part.station].position[1] + part.offset[1] + 1.5);
});
