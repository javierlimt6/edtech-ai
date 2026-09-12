import { FACTORY } from "./layout.ts";
// An inspectable inference simulation. No model weights or engine benchmarks.
export type Phase =
  | "idle"
  | "tokenize"
  | "embed"
  | "attention"
  | "ffn"
  | "sample"
  | "emit"
  | "done";
export type Settings = {
  engine: "reference" | "vllm" | "speculative";
  kvCache: boolean;
  paged: boolean;
  gqa: boolean;
  continuous: boolean;
  speculative: boolean;
  temperature: number;
  topK: number;
  maxTokens: number;
  batchSize: number;
};
export const DEFAULTS: Settings = {
  engine: "vllm",
  kvCache: true,
  paged: true,
  gqa: true,
  continuous: true,
  speculative: false,
  temperature: 0.7,
  topK: 3,
  maxTokens: 16,
  batchSize: 3,
};
export const PHASES: Exclude<Phase, "idle" | "done">[] = [
  "tokenize",
  "embed",
  "attention",
  "ffn",
  "sample",
  "emit",
];
export const STATIONS = [
  {
    id: "tokenize",
    name: "Tokenizer",
    short: "TOKENS",
    color: "#f2aa5a",
    position: FACTORY.tokenize.position,
    description:
      "Text splits into token IDs. This sandbox uses a simple word-and-punctuation tokenizer; production tokenizers use learned subwords.",
  },
  {
    id: "embed",
    name: "Embedding",
    short: "EMBED",
    color: "#73e2b0",
    position: FACTORY.embed.position,
    description:
      "Each token ID looks up a vector. Position information lets the model distinguish the order of those tokens.",
  },
  {
    id: "attention",
    name: "Attention",
    short: "ATTEND",
    color: "#62d4f3",
    position: FACTORY.attention.position,
    description:
      "Queries read keys and values from earlier tokens. Saved keys and values are reused as each new token is generated.",
  },
  {
    id: "ffn",
    name: "Feed-forward",
    short: "THINK",
    color: "#b6a0f3",
    position: FACTORY.ffn.position,
    description:
      "A feed-forward network transforms each token’s features. Real models repeat attention and feed-forward blocks across many layers; this world shows one representative layer.",
  },
  {
    id: "sample",
    name: "Sampling",
    short: "SAMPLE",
    color: "#ffc563",
    position: FACTORY.sample.position,
    description:
      "Logits become probabilities. Temperature changes their spread; top-k limits the candidate set. One token is selected.",
  },
  {
    id: "emit",
    name: "Output",
    short: "OUTPUT",
    color: "#f095a0",
    position: FACTORY.emit.position,
    description:
      "The selected token joins the answer. Its embedding enters the next decode pass; the loop continues until the output limit.",
  },
] as const;
export type Station = (typeof STATIONS)[number];
export type Token = { text: string; id: number };
export type Candidate = { text: string; probability: number };
export type Draft = { text: string; accepted: boolean; verified: boolean };
export type Job = {
  id: number;
  lane: number | null;
  prompt: number;
  generated: number;
  target: number;
  status: "waiting" | "active" | "done";
};
export type Run = {
  phase: Phase;
  tokens: Token[];
  output: string[];
  pending: string[];
  candidates: Candidate[];
  drafts: Draft[];
  accepted: number;
  rejected: number;
  jobs: Job[];
  tick: number;
  passes: number;
  prompt: string;
  progress: number;
  lastEmitted: number;
  previousJobs: Job[];
  work: {
    processed: number;
    recomputed: number;
    cacheReads: number;
    drafted: number;
    verified: number;
    idleLanes: number;
    occupiedLanes: number;
    laneSteps: number;
    peakReserved: number;
    peakUnused: number;
  };
};
export const idleRun = (): Run => ({
  phase: "idle",
  tokens: [],
  output: [],
  pending: [],
  candidates: [],
  drafts: [],
  accepted: 0,
  rejected: 0,
  jobs: [],
  tick: 0,
  passes: 0,
  prompt: "",
  progress: 0,
  lastEmitted: 0,
  previousJobs: [],
  work: {
    processed: 0,
    recomputed: 0,
    cacheReads: 0,
    drafted: 0,
    verified: 0,
    idleLanes: 0,
    occupiedLanes: 0,
    laneSteps: 0,
    peakReserved: 0,
    peakUnused: 0,
  },
});
export function hash(text: string) {
  let n = 2166136261;
  for (const char of text) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function tokenize(prompt: string): Token[] {
  return (prompt.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []).map(
    (text) => ({ text, id: hash(text.toLowerCase()) % 32000 }),
  );
}
export function preset(
  engine: Settings["engine"],
): Pick<
  Settings,
  "engine" | "kvCache" | "paged" | "gqa" | "continuous" | "speculative"
> {
  return {
    engine,
    kvCache: true,
    paged: engine !== "reference",
    gqa: engine !== "reference",
    continuous: engine !== "reference",
    speculative: engine === "speculative",
  };
}
export function begin(prompt: string, settings: Settings): Run {
  const tokens = tokenize(prompt);
  if (!tokens.length) return idleRun();
  const jobs: Job[] = Array.from({ length: 8 }, (_, id) => ({
    id,
    prompt: id === 0 ? tokens.length : 4 + (id % 5),
    generated: 0,
    target: id === 0 ? settings.maxTokens : 2 + ((id * 3) % 7),
    status: id < settings.batchSize ? "active" : "waiting",
    lane: id < settings.batchSize ? id : null,
  }));
  return {
    ...idleRun(),
    phase: "tokenize",
    tokens,
    jobs,
    previousJobs: jobs,
    prompt,
  };
}
function vocabulary(prompt: string): string[][] {
  const topic = /tree|forest|minecraft|block/i.test(prompt)
    ? [
        "A",
        "voxel",
        "world",
        "begins",
        "with",
        "one",
        "small",
        "block",
        "and",
        "grows",
        "into",
        "something",
        "you",
        "can",
        "explore",
        ".",
      ]
    : /space|star|moon/i.test(prompt)
      ? [
          "The",
          "stars",
          "shine",
          "across",
          "a",
          "vast",
          "night",
          "sky",
          "where",
          "new",
          "worlds",
          "wait",
          "to",
          "be",
          "discovered",
          ".",
        ]
      : [
          "An",
          "AI",
          "model",
          "reads",
          "your",
          "prompt",
          "and",
          "predicts",
          "the",
          "next",
          "token",
          "using",
          "patterns",
          "learned",
          "during",
          "training",
          ".",
        ];
  const alternatives: Record<string, string[]> = {
    voxel: ["blocky", "pixel"],
    world: ["landscape", "island"],
    begins: ["starts", "opens"],
    small: ["tiny", "bright"],
    grows: ["expands", "builds"],
    explore: ["discover", "visit"],
    stars: ["planets", "lights"],
    shine: ["glow", "sparkle"],
    vast: ["quiet", "endless"],
    new: ["distant", "strange"],
    AI: ["language", "transformer"],
    reads: ["processes", "encodes"],
    prompt: ["input", "text"],
    predicts: ["selects", "generates"],
    patterns: ["relationships", "features"],
    learned: ["acquired", "encoded"],
  };
  return topic.map((word) => [
    word,
    ...(alternatives[word] ??
      (word === "."
        ? ["!", "…"]
        : [
            word.toLowerCase() === word
              ? word.toUpperCase()
              : word.toLowerCase(),
            "…",
          ])),
  ]);
}
export function distribution(
  words: string[],
  temperature: number,
  topK: number,
): Candidate[] {
  const unique = [...new Set(words)].slice(0, topK);
  if (temperature === 0)
    return unique.map((text, i) => ({ text, probability: i === 0 ? 1 : 0 }));
  const weights = unique.map((_, i) => Math.exp((-i * 1.3) / temperature));
  const sum = weights.reduce((a, b) => a + b, 0);
  return unique.map((text, i) => ({ text, probability: weights[i] / sum }));
}
function choose(candidates: Candidate[], seed: number) {
  const draw = (hash(String(seed)) % 10000) / 10000;
  let sum = 0;
  return (
    candidates.find((candidate) => {
      sum += candidate.probability;
      return draw < sum;
    })?.text ?? candidates[0].text
  );
}
export function candidateWords(prompt: string, index: number) {
  const words = vocabulary(prompt);
  return words[index % words.length];
}
function sampleAt(run: Run, settings: Settings, index: number) {
  const words = vocabulary(run.prompt);
  const candidates = distribution(
    words[index % words.length],
    settings.temperature,
    settings.topK,
  );
  return {
    candidates,
    text: choose(candidates, hash(run.prompt) + index * 17),
  };
}
export function enterNextStage(run: Run, settings: Settings): Run {
  if (run.phase === "idle" || run.phase === "done") return run;
  const phase =
    run.phase === "emit"
      ? run.jobs.every((job) => job.status === "done")
        ? "done"
        : "embed"
      : PHASES[PHASES.indexOf(run.phase) + 1];
  const next: Run = { ...run, phase, progress: 0, tick: run.tick + 1 };
  if (phase !== "sample") return next;
  const remaining = settings.maxTokens - run.output.length;
  const pending: string[] = [];
  const drafts: Draft[] = [];
  if (remaining > 0) {
    const count = settings.speculative ? Math.min(3, remaining) : 1;
    let mismatch = false;
    for (let i = 0; i < count; i++) {
      const target = sampleAt(run, settings, run.output.length + i).text;
      const accepts = !settings.speculative || (run.passes + i) % 4 !== 2;
      drafts.push({
        text: accepts ? target : "…",
        accepted: !mismatch && accepts,
        verified: !mismatch,
      });
      if (!mismatch) pending.push(target);
      // Later proposals are discarded without verification after a mismatch.
      if (!accepts) mismatch = true;
    }
  }
  return {
    ...next,
    candidates:
      remaining > 0
        ? sampleAt(run, settings, run.output.length).candidates
        : [],
    pending,
    drafts: settings.speculative ? drafts : [],
  };
}

// Commit a stage exactly once, at its final frame. The same pure result can be
// previewed by the renderer to show packets approaching their destination.
export function completeStage(run: Run, settings: Settings): Run {
  if (run.progress === 1 || run.phase === "idle" || run.phase === "done")
    return run;
  let next: Run = { ...run, progress: 1, work: { ...run.work } };
  const promptActive = run.output.length < settings.maxTokens;
  const context = run.tokens.length + run.output.length;
  const fresh = run.output.length ? run.lastEmitted : run.tokens.length;
  if (run.phase === "embed" && promptActive) {
    next.work.processed += settings.kvCache ? fresh : context;
    next.work.recomputed += settings.kvCache ? 0 : context - fresh;
  }
  if (run.phase === "attention" && promptActive && settings.kvCache)
    next.work.cacheReads += context - fresh;
  if (run.phase === "sample" && promptActive) {
    next.passes++;
    next.work.drafted += run.drafts.length;
    next.work.verified += run.drafts.filter((draft) => draft.verified).length;
    next.accepted += run.drafts.filter((draft) => draft.accepted).length;
    next.rejected += run.drafts.filter(
      (draft) => draft.verified && !draft.accepted,
    ).length;
  }
  if (run.phase === "emit") {
    let jobs = run.jobs.map((job) => {
      if (job.status !== "active") return { ...job };
      const generated = Math.min(
        job.target,
        job.generated + (job.id === 0 ? run.pending.length : 1),
      );
      return {
        ...job,
        generated,
        lane: generated >= job.target ? null : job.lane,
        status:
          generated >= job.target ? ("done" as const) : ("active" as const),
      };
    });
    const active = jobs.filter((job) => job.status === "active").length;
    if (settings.continuous || active === 0) {
      const freeLanes = Array.from(
        { length: settings.batchSize },
        (_, lane) => lane,
      ).filter((lane) => !jobs.some((job) => job.lane === lane));
      jobs = jobs.map((job) => {
        if (job.status !== "waiting") return job;
        const lane = freeLanes.shift();
        return lane === undefined ? job : { ...job, status: "active", lane };
      });
    }
    const occupied = run.jobs.filter((job) => job.status === "active").length;
    next = {
      ...next,
      output: [...run.output, ...run.pending],
      lastEmitted: run.pending.length,
      pending: [],
      previousJobs: run.jobs,
      jobs,
    };
    next.work.idleLanes += settings.batchSize - occupied;
    next.work.occupiedLanes += occupied;
    next.work.laneSteps += settings.batchSize;
  }
  const stats = memory(next, settings);
  next.work.peakReserved = Math.max(run.work.peakReserved, stats.reserved);
  next.work.peakUnused = Math.max(
    run.work.peakUnused,
    stats.reserved - stats.used,
  );
  return next;
}

export function memory(run: Run, settings: Settings) {
  const heads = settings.gqa ? 2 : 8;
  const active = settings.kvCache
    ? run.jobs.filter((job) => job.status === "active")
    : [];
  const blocks = active.flatMap((job) => {
    const used = job.prompt + job.generated;
    const reserved = settings.paged
      ? Math.ceil(used / 4)
      : Math.ceil((job.prompt + job.target) / 4);
    return Array.from({ length: reserved }, (_, i) => ({
      owner: job.id,
      tokens: Math.max(0, Math.min(4, used - i * 4)),
      kvHeads: heads,
    }));
  });
  const used =
    active.reduce((sum, job) => sum + job.prompt + job.generated, 0) * heads;
  const reserved = blocks.length * 4 * heads;
  return {
    blocks,
    heads,
    used,
    reserved,
    waste: reserved ? 1 - used / reserved : 0,
  };
}
export function outputText(tokens: string[]) {
  return tokens.join(" ").replace(/\s+([.!?,…])/g, "$1");
}

// Manual stepping completes the current stage, then shows the next completed stage.
export function advance(run: Run, settings: Settings): Run {
  return completeStage(
    enterNextStage(completeStage(run, settings), settings),
    settings,
  );
}
// Frames interpolate a single shared timeline; counts commit only at boundaries.
export function elapse(run: Run, settings: Settings, seconds: number): Run {
  if (run.phase === "idle" || run.phase === "done" || seconds <= 0) return run;
  let next = run;
  let remaining = seconds;
  while (remaining > 0 && next.phase !== "done") {
    if (next.progress === 1) next = enterNextStage(next, settings);
    if (next.phase === "done") break;
    const available = 1 - next.progress;
    if (remaining < available)
      return { ...next, progress: next.progress + remaining };
    remaining -= available;
    next = completeStage(next, settings);
  }
  return next;
}
