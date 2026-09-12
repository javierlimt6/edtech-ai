import { FACTORY } from "./layout.ts";
import { memory, STATIONS } from "./sim.ts";
import type { Run, Settings, Station } from "./sim.ts";

export type InspectId = Station["id"] | "cache" | "scheduler" | "draft";
export const stageNumber = (id: InspectId) =>
  STATIONS.findIndex((s) => s.id === id) + 1;
export function sequenceLabel(id: InspectId) {
  const step = stageNumber(id);
  if (step) return String(step).padStart(2, "0");
  if (id === "cache") return "WITH 3";
  if (id === "draft") return "BEFORE 5";
  return "BETWEEN PASSES";
}
export const EXHIBITS = [
  ...STATIONS,
  {
    id: "cache",
    name: "KV cache",
    color: "#73e2b0",
    position: FACTORY.cache.position,
    description: "Reuse context or watch it being recomputed.",
  },
  {
    id: "scheduler",
    name: "Request scheduler",
    color: "#f2aa5a",
    position: FACTORY.scheduler.position,
    description: "Follow requests through the available batch lanes.",
  },
  {
    id: "draft",
    name: "Draft model",
    color: "#b6a0f3",
    position: FACTORY.draft.position,
    description: "Draft, verify, and keep or discard proposed tokens.",
  },
] as const;
export const operationIndex = (run: Run) =>
  Math.min(2, Math.floor(run.progress * 3));
export const operationProgress = (run: Run, index: number) =>
  Math.max(0, Math.min(1, run.progress * 3 - index));

export function inspect(id: InspectId, run: Run, settings: Settings) {
  const stats = memory(run, settings);
  const remaining = run.output.length < settings.maxTokens;
  const decoding = run.output.length > 0;
  const jobs = run.jobs.filter((job) => job.status === "active");
  const context = remaining
    ? run.tokens.length + run.output.length
    : jobs.reduce((sum, job) => sum + job.prompt + job.generated, 0);
  const fresh = remaining
    ? decoding
      ? run.lastEmitted
      : run.tokens.length
    : jobs.reduce((sum, job) => sum + (job.generated ? 1 : job.prompt), 0);
  const processed = settings.kvCache ? fresh : context;
  const currentTokens = run.output
    .slice(-Math.max(1, run.lastEmitted))
    .join(" ");
  const steps: Record<InspectId, string[]> = {
    tokenize: [
      "Read the prompt text",
      "Split words and punctuation into tokens",
      "Keep each token’s ID and position",
    ],
    embed: [
      decoding
        ? settings.kvCache
          ? "Bring newly generated tokens back into the model"
          : "Bring the entire growing context back into the model"
        : "Bring input tokens to the embedding table",
      "Look up a vector for each token ID",
      "Carry token identity and position into attention",
    ],
    attention: [
      settings.kvCache
        ? "Write new keys and values into the cache"
        : "Recompute keys and values for the full context",
      settings.kvCache
        ? "Read previous keys and values from the cache"
        : "Read the recomputed context",
      settings.gqa
        ? "Eight query heads combine context through two shared KV heads"
        : "Eight query heads combine context through eight separate KV heads",
    ],
    ffn: [
      "Receive context-enriched token vectors",
      "Transform features independently at each position",
      "Send the final position’s features toward next-token prediction",
    ],
    sample: [
      settings.speculative
        ? "Receive draft proposals and target candidates"
        : "Receive next-token candidates",
      "Apply temperature and top-k to candidate probabilities",
      settings.speculative
        ? "Verify proposals; stop at a mismatch and use the target correction"
        : "Select one token from the distribution",
    ],
    emit: [
      "Move selected tokens into the answer",
      "Append tokens and finish requests that reach their limit",
      "Release finished lanes and schedule the next batch step",
    ],
    cache: settings.kvCache
      ? [
          "Store new keys and values",
          settings.paged
            ? "Read context through the page table"
            : "Read context from the reserved contiguous region",
          "Reuse stored context for the next decode pass",
        ]
      : [
          "Persistent KV storage is disabled",
          "Recompute prior context on every decode pass",
          "Discard temporary keys and values after use",
        ],
    scheduler: [
      "Active lanes perform one generation step",
      "Completed requests release their lanes",
      settings.continuous
        ? "Admit waiting requests into free lanes immediately"
        : "Wait until every request in this batch finishes before admitting the next batch",
    ],
    draft: settings.speculative
      ? [
          "Propose up to three tokens",
          "Check proposals against the target simulation",
          "Keep the matching prefix; discard a mismatch and emit the target correction",
        ]
      : [
          "Draft model is disabled",
          "The target selects one token per pass",
          "Repeat the target pass for each output token",
        ],
  };
  const active =
    id === run.phase ||
    (id === "cache" && run.phase === "attention") ||
    (id === "scheduler" && run.phase === "emit") ||
    (id === "draft" && run.phase === "sample");
  const disabled =
    (id === "cache" && !settings.kvCache) ||
    (id === "draft" && !settings.speculative);
  const completed =
    run.phase === "done" ||
    (!remaining && (id === "draft" || id === "tokenize"));
  const status = disabled
    ? "Disabled"
    : completed
      ? "Completed"
      : active
        ? "Active"
        : "Waiting";
  const index = active && !completed ? operationIndex(run) : -1;
  const details: Record<InspectId, string> = {
    tokenize: `${run.tokens.length} input tokens · word/punctuation tokenizer`,
    embed: `${processed} token positions this pass${remaining ? (decoding ? ` · newest: ${currentTokens}` : "") : ` · ${jobs.length} workload requests`}`,
    attention: `${context} context tokens · 8 query heads / ${stats.heads} KV heads`,
    ffn: `${processed} token positions · one representative transformer layer`,
    sample: !remaining
      ? `${jobs.length} workload requests · prompt complete`
      : `${run.candidates.map((c) => `${c.text} ${Math.round(c.probability * 100)}%`).join(" · ") || "No candidates yet"}`,
    emit: `${run.output.length}/${settings.maxTokens} prompt tokens · ${run.jobs.filter((j) => j.status === "done").length}/8 requests complete`,
    cache: settings.kvCache
      ? `${stats.used}/${stats.reserved} KV slots used · ${stats.reserved - stats.used} unused · ${run.work.cacheReads} context tokens reused`
      : `${run.work.recomputed} prior token positions recomputed · 0 persistent KV slots`,
    scheduler: `${run.jobs.filter((j) => j.status === "active").length}/${settings.batchSize} occupied lanes · ${run.work.idleLanes} idle lane steps`,
    draft: `${run.passes} target passes · ${run.work.drafted} drafted · ${run.work.verified} verified · ${run.accepted} kept / ${run.rejected} rejected / ${run.work.drafted - run.work.verified} discarded`,
  };
  return {
    status,
    index,
    steps: steps[id],
    detail: details[id],
    action:
      index >= 0
        ? steps[id][index]
        : disabled
          ? steps[id][0]
          : completed
            ? "Work completed."
            : run.phase === "idle"
              ? "Send a prompt to observe this operation."
              : "Waiting for this operation’s next turn.",
  };
}

export function flowTokens(run: Run, settings: Settings) {
  if (run.phase === "idle" || run.phase === "done") return [];
  if (run.phase === "emit")
    return (
      run.progress < 1
        ? run.pending
        : run.lastEmitted
          ? run.output.slice(-run.lastEmitted)
          : []
    ).map((text, i) => ({
      key: `out-${run.progress < 1 ? run.output.length + i : run.output.length - run.lastEmitted + i}`,
      text,
    }));
  if (run.phase === "sample")
    return run.pending.map((text, i) => ({
      key: `out-${run.output.length + i}`,
      text,
    }));
  if (run.output.length >= settings.maxTokens)
    return run.jobs
      .filter((j) => j.status === "active")
      .map((j) => ({
        key: `job-${j.id}`,
        text: `R${j.id + 1} · ${j.generated}/${j.target}`,
      }));
  const inputs = run.tokens.map((token, i) => ({
    key: `in-${i}`,
    text: token.text,
  }));
  const outputs = run.output.map((text, i) => ({ key: `out-${i}`, text }));
  return run.output.length === 0 || run.phase === "tokenize"
    ? inputs
    : settings.kvCache
      ? outputs.slice(-run.lastEmitted)
      : [...inputs, ...outputs];
}
