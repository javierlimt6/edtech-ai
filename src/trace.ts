import { machineOffset } from "./layout.ts";
import {
  begin,
  completeStage,
  enterNextStage,
  memory,
  distribution,
  candidateWords,
} from "./sim.ts";
import type { Run, Settings } from "./sim.ts";
import { EXHIBITS, flowTokens } from "./flow.ts";
import type { InspectId } from "./flow.ts";

export type Point = [number, number, number];
export type Part = {
  id: string;
  station: InspectId;
  name: string;
  purpose: string;
  offset: Point;
  kind:
    "hopper" | "piston" | "drawer" | "comparator" | "lamp" | "gate" | "board";
};
const part = (
  station: InspectId,
  id: string,
  name: string,
  purpose: string,
  offset: Point,
  kind: Part["kind"],
): Part => ({ station, id, name, purpose, offset: machineOffset(station, offset), kind });
export const PARTS: Part[] = [
  part(
    "tokenize",
    "input",
    "Prompt input",
    "Receive the learner’s prompt text.",
    [-3, 0, 0],
    "hopper",
  ),
  part(
    "tokenize",
    "split",
    "Tokenization",
    "Split words and punctuation into toy tokens.",
    [0, 0, 0],
    "piston",
  ),
  part(
    "tokenize",
    "stamp",
    "Token ID mapping",
    "Assign each token a stable ID and position.",
    [3, 0, 0],
    "piston",
  ),
  part(
    "embed",
    "lookup",
    "Token embedding lookup",
    "Look up a representative vector for each token ID.",
    [-2, 0, 0],
    "drawer",
  ),
  part(
    "embed",
    "vector",
    "Positional encoding",
    "Combine token identity with position information.",
    [2, 0, 0],
    "comparator",
  ),
  part(
    "attention",
    "keys",
    "Key and value projections",
    "Produce keys and values for the current positions.",
    [-3, 0, 0],
    "drawer",
  ),
  part(
    "attention",
    "queries",
    "Attention heads",
    "Eight query heads read separate or shared key/value heads.",
    [0, 0, 0],
    "comparator",
  ),
  part(
    "attention",
    "mix",
    "Attention output projection",
    "Combine the retrieved context into token features.",
    [3, 0, 0],
    "hopper",
  ),
  part(
    "ffn",
    "expand",
    "FFN up-projection",
    "Expand each position’s feature representation.",
    [-3, 0, 0],
    "piston",
  ),
  part(
    "ffn",
    "activate",
    "Activation function",
    "Apply an illustrative nonlinear feature transformation.",
    [0, 0, 0],
    "gate",
  ),
  part(
    "ffn",
    "compress",
    "FFN down-projection",
    "Project transformed features back to the model width.",
    [3, 0, 0],
    "piston",
  ),
  part(
    "sample",
    "candidates",
    "Next-token distribution",
    "Display illustrative next-token candidates.",
    [-3, 0, 0],
    "lamp",
  ),
  part(
    "sample",
    "temperature",
    "Temperature scaling",
    "Change the probability distribution’s spread.",
    [-1, 0, 0],
    "comparator",
  ),
  part(
    "sample",
    "topk",
    "Top-k filtering",
    "Keep the highest-ranked candidates and renormalize.",
    [1, 0, 0],
    "gate",
  ),
  part(
    "sample",
    "select",
    "Token sampling",
    "Select a token using the deterministic toy sampler.",
    [3, 0, 0],
    "hopper",
  ),
  part(
    "emit",
    "conveyor",
    "Token decoding",
    "Convert selected token IDs back into text.",
    [-3, 0, 0],
    "piston",
  ),
  part(
    "emit",
    "answer",
    "Output sequence",
    "Append each selected token to the answer.",
    [0, 0, 0],
    "board",
  ),
  part(
    "emit",
    "complete",
    "Stopping criteria",
    "Advance requests and detect their output limits.",
    [3, 0, 0],
    "comparator",
  ),
  part(
    "cache",
    "store",
    "Persistent KV storage",
    "Save keys and values for reuse on later decode passes.",
    [-2, 0, 0],
    "drawer",
  ),
  part(
    "cache",
    "pages",
    "Page-table controller",
    "Address KV storage in blocks of four token positions.",
    [1, 0, 0],
    "comparator",
  ),
  part(
    "cache",
    "read",
    "KV cache lookup",
    "Read stored context without recomputing it.",
    [3, 0, 0],
    "gate",
  ),
  part(
    "scheduler",
    "lanes",
    "Request lanes",
    "Track progress of the eight illustrative requests.",
    [-3, 0, 0],
    "board",
  ),
  part(
    "scheduler",
    "release",
    "Request completion",
    "Free lanes after completed requests leave.",
    [0, 0, 0],
    "gate",
  ),
  part(
    "scheduler",
    "admit",
    "Request scheduling",
    "Admit waiting requests immediately or at a batch boundary.",
    [3, 0, 0],
    "gate",
  ),
  part(
    "draft",
    "propose",
    "Draft model",
    "Propose up to three tokens for a target pass.",
    [-3, 0, 0],
    "drawer",
  ),
  part(
    "draft",
    "verify",
    "Target model verification",
    "Check proposals against the target simulation.",
    [0, 0, 0],
    "comparator",
  ),
  part(
    "draft",
    "reject",
    "Draft rejection",
    "Discard a mismatch and all subsequent guesses.",
    [3, 0, 0],
    "hopper",
  ),
];
export function enabledPart(p: Part, settings: Settings) {
  return (
    !(p.station === "cache" && !settings.kvCache) &&
    !(p.id === "pages" && !settings.paged) &&
    !(p.station === "draft" && !settings.speculative)
  );
}
export function partPosition(id: string): Point {
  const p = PARTS.find((p) => p.id === id)!;
  const station = EXHIBITS.find((s) => s.id === p.station)!;
  return [
    station.position[0] + p.offset[0],
    station.position[1] + 1.5 + p.offset[1],
    station.position[2] + p.offset[2],
  ];
}
export type TraceEvent = {
  id: number;
  part: string;
  station: InspectId;
  pass: number;
  action: string;
  input: string;
  output: string;
  before: Run;
  after: Run;
  cacheBefore: ReturnType<typeof memory>;
  cacheAfter: ReturnType<typeof memory>;
  subjects: { key: string; text: string }[];
  heads?: { query: number; kv: number }[];
  from: Point;
  to: Point;
};
export type Trace = { events: TraceEvent[]; initial: Run; final: Run };

export function buildTrace(prompt: string, settings: Settings): Trace {
  let canonical = begin(prompt, settings);
  let state: Run = { ...canonical, tokens: [] };
  const initial = state;
  let cache = memory({ ...canonical, jobs: [] }, settings);
  const events: TraceEvent[] = [];
  let pass = 1;
  const add = (
    id: string,
    action: string,
    input: string,
    output: string,
    patch: Partial<Run> = {},
    subjects = flowTokens(canonical, settings),
  ) => {
    const p = PARTS.find((p) => p.id === id)!;
    const after = { ...state, ...patch };
    const cacheBefore = cache;
    if ((id === "store" && !settings.paged) || id === "pages")
      cache = memory(canonical, settings);
    if (id === "release") {
      const blocks = cache.blocks.filter((block) =>
        after.jobs.some(
          (job) => job.id === block.owner && job.status === "active",
        ),
      );
      const used = blocks.reduce(
        (sum, block) => sum + block.tokens * block.kvHeads,
        0,
      );
      const reserved = blocks.length * 4 * cache.heads;
      cache = {
        ...cache,
        blocks,
        used,
        reserved,
        waste: reserved ? 1 - used / reserved : 0,
      };
    }
    const to = partPosition(id);
    events.push({
      id: events.length,
      part: id,
      station: p.station,
      pass,
      action,
      input,
      output,
      before: state,
      after,
      cacheBefore,
      cacheAfter: cache,
      subjects: ["candidates", "temperature", "topk"].includes(id)
        ? after.candidates.map((c, i) => ({ key: `candidate-${i}`, text: c.text }))
        : p.station === "scheduler"
          ? after.jobs.filter(j => j.status === "active").map(j => ({ key: `job-${j.id}`, text: `R${j.id + 1}` }))
          : subjects,
      from: events.length
        ? events[events.length - 1].to
        : [to[0] - 2, to[1], to[2]],
      to,
    });
    state = after;
  };
  while (canonical.phase !== "done" && canonical.phase !== "idle") {
    const end = completeStage(canonical, settings);
    const promptActive = canonical.output.length < settings.maxTokens;
    const fresh = canonical.output.length
      ? canonical.lastEmitted
      : canonical.tokens.length;
    const context = canonical.tokens.length + canonical.output.length;
    const count = promptActive
      ? settings.kvCache
        ? fresh
        : context
      : canonical.jobs.filter((j) => j.status === "active").length;
    const values = `${count} positions · ${context} prompt context tokens`;
    state = {
      ...state,
      phase: canonical.phase,
      tick: canonical.tick,
      progress: 0,
    };
    if (canonical.phase === "tokenize") {
      add(
        "input",
        "Read the prompt text",
        prompt,
        `${canonical.tokens.length} word/punctuation pieces`,
      );
      add(
        "split",
        "Split words and punctuation",
        prompt,
        canonical.tokens.map((t) => t.text).join(" | "),
      );
      canonical.tokens.forEach((token, i) =>
        add(
          "stamp",
          `Stamp token ${i + 1}: ${token.text}`,
          token.text,
          `ID ${token.id} · position ${i}`,
          { tokens: canonical.tokens.slice(0, i + 1) },
          [{ key: `in-${i}`, text: token.text }],
        ),
      );
    } else if (canonical.phase === "embed") {
      const tokens = [
        ...canonical.tokens.map((t) => t.text),
        ...canonical.output,
      ];
      const inputs = promptActive
        ? settings.kvCache && canonical.output.length
          ? tokens.slice(-fresh)
          : tokens
        : canonical.jobs
            .filter((j) => j.status === "active")
            .map((j) => `Request ${j.id + 1}`);
      inputs.forEach((text, i) =>
        add(
          "lookup",
          `Look up ${text}`,
          `Position ${i} · ${text}`,
          "Representative vector (no numerical tensors)",
          {
            work: {
              ...state.work,
              processed: state.work.processed + (promptActive ? 1 : 0),
              recomputed:
                state.work.recomputed +
                (promptActive && !settings.kvCache && i < context - fresh
                  ? 1
                  : 0),
            },
          },
          [flowTokens(canonical, settings)[i] ?? { key: `position-${i}`, text }],
        ),
      );
      add(
        "vector",
        "Assemble token and position features",
        values,
        "Position-aware vectors",
        {
          work: {
            ...state.work,
            processed: end.work.processed,
            recomputed: end.work.recomputed,
          },
        },
      );
    } else if (canonical.phase === "attention") {
      add(
        "keys",
        settings.kvCache
          ? "Produce new keys and values"
          : "Recompute keys and values for the full context",
        values,
        `${settings.gqa ? 2 : 8} KV heads`,
      );
      if (settings.kvCache) {
        add(
          "store",
          "Store new keys and values",
          `${fresh} fresh prompt positions`,
          `${memory(canonical, settings).used} workload KV slots in use`,
        );
        if (settings.paged)
          add(
            "pages",
            "Allocate/address KV blocks through the page table",
            "Logical context positions",
            `${memory(canonical, settings).blocks.length} blocks · 4 positions per block`,
          );
        add(
          "read",
          "Read previously stored context",
          `${promptActive ? context - fresh : 0} prior prompt positions`,
          "Context reused",
          { work: { ...state.work, cacheReads: end.work.cacheReads } },
        );
      }
      add(
        "queries",
        "Eight query heads read context in parallel",
        settings.gqa ? "Eight queries share two KV heads" : "Eight queries read eight KV heads",
        "Eight head results ready for the attention output projection",
      );
      events[events.length - 1].heads = Array.from({ length: 8 }, (_, i) => ({
        query: i + 1, kv: settings.gqa ? Math.floor(i / 4) + 1 : i + 1,
      }));
      add(
        "mix",
        "Mix retrieved context",
        "Eight query-head results",
        "Context-enriched features",
      );
    } else if (canonical.phase === "ffn") {
      add("expand", "Expand token features", values, "Expanded features");
      add(
        "activate",
        "Transform features independently",
        "Expanded features",
        "Activated features",
      );
      add(
        "compress",
        "Compress transformed features",
        "Activated features",
        "Final-position prediction features",
      );
    } else if (canonical.phase === "sample") {
      const words = promptActive
        ? candidateWords(prompt, canonical.output.length)
        : [];
      const raw = distribution(words, 1, 3);
      const tempered = distribution(words, settings.temperature, 3);
      const describe = (cs: Run["candidates"]) =>
        cs
          .map((c) => `${c.text}: ${(100 * c.probability).toFixed(1)}%`)
          .join(" · ") || "Prompt complete; processing remaining requests";
      add(
        "candidates",
        "Receive next-token candidates",
        "Final-position features",
        describe(raw),
        { candidates: raw, drafts: [], pending: [] },
      );
      add(
        "temperature",
        `Apply temperature ${settings.temperature}`,
        describe(raw),
        describe(tempered),
        { candidates: tempered },
      );
      add(
        "topk",
        `Keep top ${settings.topK} candidates`,
        describe(tempered),
        describe(canonical.candidates),
        { candidates: canonical.candidates },
      );
      if (settings.speculative && canonical.drafts.length) {
        add(
          "propose",
          "Propose draft tokens",
          "Current context",
          canonical.drafts.map((d) => d.text).join(" "),
          {
            drafts: canonical.drafts.map((d) => ({
              ...d,
              accepted: false,
              verified: false,
            })),
            work: { ...state.work, drafted: end.work.drafted },
          },
          canonical.drafts.map((d, i) => ({ key: `draft-${i}`, text: d.text })),
        );
        canonical.drafts.forEach((draft, i) => {
          if (draft.verified)
            add(
              "verify",
              `Verify proposal ${i + 1}: ${draft.accepted ? "keep" : "mismatch"}`,
              draft.text,
              draft.accepted
                ? "Matching prefix accepted"
                : "Use target correction; discard following guesses",
              {
                drafts: state.drafts.map((d, index) =>
                  index === i ? draft : d,
                ),
                accepted: state.accepted + Number(draft.accepted),
                rejected: state.rejected + Number(!draft.accepted),
                work: { ...state.work, verified: state.work.verified + 1 },
              },
              [{ key: `draft-${i}`, text: draft.text }],
            );
          else
            add(
              "reject",
              `Discard proposal ${i + 1} after mismatch`,
              draft.text,
              "Not verified",
              {},
              [{ key: `draft-${i}`, text: draft.text }],
            );
        });
        if (canonical.drafts.some((d) => !d.accepted))
          add(
            "reject",
            "Discard rejected draft tokens",
            "Mismatch and following proposals",
            "Only matching prefix and target correction continue",
            {},
            canonical.drafts.flatMap((d, i) => d.accepted ? [] : [{ key: `draft-${i}`, text: d.text }]),
          );
      }
      add(
        "select",
        settings.speculative
          ? "Release verified prefix and target correction"
          : "Select one token",
        describe(canonical.candidates),
        canonical.pending.join(" ") || "Remaining workload requests",
        {
          pending: canonical.pending,
          drafts: canonical.drafts,
          passes: end.passes,
          accepted: end.accepted,
          rejected: end.rejected,
          work: {
            ...state.work,
            drafted: end.work.drafted,
            verified: end.work.verified,
          },
        },
      );
    } else if (canonical.phase === "emit") {
      add(
        "conveyor",
        "Decode selected tokens into text",
        canonical.pending.join(" "),
        "Tokens ready to append",
      );
      canonical.pending.forEach((token, i) =>
        add(
          "answer",
          `Append ${token}`,
          token,
          [...canonical.output, ...canonical.pending.slice(0, i + 1)].join(" "),
          {
            output: [...canonical.output, ...canonical.pending.slice(0, i + 1)],
          },
          [{ key: `out-${canonical.output.length + i}`, text: token }],
        ),
      );
      const advanced = canonical.jobs.map((job) => ({
        ...job,
        generated:
          job.status === "active"
            ? Math.min(
                job.target,
                job.generated + (job.id === 0 ? canonical.pending.length : 1),
              )
            : job.generated,
      }));
      add(
        "complete",
        "Advance requests and detect completion",
        "Active requests",
        `${advanced.filter((j) => j.status === "active" && j.generated >= j.target).length} requests reached their limit`,
        {
          jobs: advanced,
          previousJobs: canonical.jobs,
          pending: [],
          lastEmitted: canonical.pending.length,
        },
      );
      add(
        "lanes",
        "Account for occupied and idle lanes",
        `${settings.batchSize} available lanes`,
        `${canonical.jobs.filter((j) => j.status === "active").length} occupied`,
        {
          work: {
            ...state.work,
            idleLanes: end.work.idleLanes,
            occupiedLanes: end.work.occupiedLanes,
            laneSteps: end.work.laneSteps,
          },
        },
      );
      add(
        "release",
        "Release completed request lanes",
        "Completed requests",
        "Freed lanes",
        {
          jobs: state.jobs.map((j) =>
            j.status === "active" && j.generated >= j.target
              ? { ...j, status: "done", lane: null }
              : j,
          ),
        },
      );
      add(
        "admit",
        settings.continuous
          ? "Admit waiting requests immediately"
          : "Admit only when the whole batch finishes",
        "Free lanes and waiting requests",
        `${end.jobs.filter((j) => j.status === "active").length} active requests`,
        { jobs: end.jobs },
      );
    }
    // Preserve the engine’s final accounting, without exposing future stage results.
    const last = events[events.length - 1];
    state = {
      ...state,
      progress: 1,
      work: {
        ...state.work,
        peakReserved: end.work.peakReserved,
        peakUnused: end.work.peakUnused,
      },
    };
    last.after = state;
    if (canonical.phase === "emit") pass++;
    canonical = enterNextStage(end, settings);
  }
  return { events, initial, final: canonical };
}
export function traceFrame(trace: Trace, cursor: number) {
  const bounded = Math.max(0, Math.min(trace.events.length, cursor));
  const index = Math.floor(bounded);
  const event = trace.events[index];
  return {
    run: event ? event.before : trace.final,
    cache: event?.cacheBefore ?? trace.events.at(-1)?.cacheAfter,
    event,
    progress: bounded - index,
    index,
  };
}
export function occurrence(
  trace: Trace,
  partId: string,
  cursor: number,
  direction: -1 | 1,
) {
  const matches = trace.events.filter(
    (e) =>
      e.part === partId &&
      (direction < 0 ? e.id < Math.floor(cursor) : e.id > cursor),
  );
  return direction < 0 ? matches.at(-1)?.id : matches[0]?.id;
}
