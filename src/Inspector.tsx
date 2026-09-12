import { LESSONS } from "./lessons";
import { useEffect, useRef, useState } from "react";
import { EXHIBITS, stageNumber, sequenceLabel } from "./flow";
import type { InspectId } from "./flow";
import type { Run, Settings } from "./sim";
import { memory, STATIONS } from "./sim";
import { PARTS, enabledPart, occurrence, traceFrame } from "./trace";
import type { Trace } from "./trace";

export default function Inspector({
  overview,
  target,
  partId,
  run,
  settings,
  running,
  trace,
  cursor,
  onPart,
  onExplain,
  onSeek,
  stats,
}: {
  overview: boolean;
  stats: ReturnType<typeof memory>;
  target: InspectId;
  partId: string | null;
  run: Run;
  settings: Settings;
  running: boolean;
  trace: Trace | null;
  cursor: number;
  onPart: (id: string) => void;
  onExplain: (id: string) => void;
  onSeek: (cursor: number) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [target]);
  const [head, setHead] = useState(1);
  const lesson = overview
    ? {
        title: "From your question to the next word",
        meaning:
          "Read the factory from left to right. Your text becomes numbers, those numbers gain context, and the model chooses one piece of the answer.",
        watch:
          "Choose a numbered station to look around. Press Play to follow the workers through the actual steps.",
        takeaway:
          "After adding a token, the model repeats the prediction with the growing answer.",
      }
    : LESSONS[target];
  const step = stageNumber(target);
  const station = EXHIBITS.find((s) => s.id === target)!;
  const parts = PARTS.filter((p) => p.station === target);
  const selected = PARTS.find((p) => p.id === partId);
  const frame = trace && traceFrame(trace, cursor);
  const active = frame?.event;
  const event = active?.part === partId ? active : undefined;
  const previous =
    trace && partId ? occurrence(trace, partId, cursor, -1) : undefined;
  const next =
    trace && partId ? occurrence(trace, partId, cursor, 1) : undefined;
  return (
    <aside
      ref={panel}
      className={`flow-inspector hud ${expanded ? "" : "is-collapsed"}`}
      aria-label="Live flow inspector"
      data-target={target}
      data-part={partId ?? ""}
      data-operation={frame?.index ?? -1}
      data-progress={(frame?.progress ?? 0).toFixed(3)}
    >
      <details
        className="lesson-disclosure"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="lesson-disclosure-toggle">
          {expanded ? "Hide lesson" : "Show lesson"}
        </summary>
        <div className="inspector-heading">
          <span className="lesson-kicker">
            {overview
              ? "THE JOURNEY / 6 STATIONS"
              : `${step ? `STAGE ${step} OF 6` : sequenceLabel(target)} / ${station.name}`}
          </span>
          <span>{event ? (running ? "Playing" : "Paused") : "Explore"}</span>
        </div>
        <ol className="lesson-sequence" aria-label="Inference stage order">
          {STATIONS.map((s, i) => (
            <li
              key={s.id}
              aria-current={!overview && s.id === target ? "step" : undefined}
              title={`${i + 1}. ${s.name}`}
            >
              <span>{i + 1}</span>
              <span className="sr-only"> {s.name}</span>
            </li>
          ))}
        </ol>
        <h2 className="lesson-title">
          {!overview && run.phase === "done"
            ? "An answer, built one token at a time."
            : lesson.title}
        </h2>
        <p className="lesson-meaning">
          {!overview && run.phase === "done"
            ? "The prompt and the background requests have finished. Replay to revisit how text became features, context, and a prediction."
            : lesson.meaning}
        </p>
        <div className="lesson-current" aria-live="polite">
          <span className="lesson-kicker">
            {overview
              ? "ONE TOKEN AT A TIME"
              : event
                ? "HAPPENING NOW"
                : "EXPLORING THIS STATION"}
          </span>
          <p>
            {overview
              ? lesson.takeaway
              : (event?.action ?? selected?.purpose ?? lesson.watch)}
          </p>
        </div>
        <div className="lesson-watch">
          <span className="lesson-kicker">FOLLOW THE WORKERS</span>
          <p>{lesson.watch}</p>
        </div>
        <p className="lesson-next">
          {overview
            ? "Start at 1. Tokens → follow the red path"
            : step > 0 && step < 6
              ? `Next: ${step + 1}. ${STATIONS[step].name}`
              : step === 6
                ? "Next token: back to 2. Embedding"
                : target === "cache"
                  ? "Returns to 3. Attention"
                  : target === "draft"
                    ? "Continues at 5. Sampling"
                    : "Assigns requests to the next pass"}
        </p>
        <section className="technical-details" aria-label="Machine details">
          <h3 className="machine-details-title">Machine details</h3>
          <p className="lesson-takeaway">{lesson.takeaway}</p>
          <label className="part-select">
            Machine part
            <select
              aria-label="Machine part"
              value={partId ?? ""}
              onChange={(e) => onPart(e.target.value)}
            >
              <option value="" disabled>
                Select a part
              </option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {enabledPart(p, settings) ? "" : " · disabled"}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <button
              className="explain-component"
              onClick={() => onExplain(selected.id)}
            >
              Explain component
            </button>
          )}
          <p className="inspector-action">
            {selected?.purpose ?? station.description}
          </p>
          {selected && !enabledPart(selected, settings) ? (
            <p>Disabled. Enable this attachment in Engine Lab.</p>
          ) : (
            <>
              <p className="inspector-action" role="status">
                {event?.action ??
                  (run.phase === "done"
                    ? "Workload complete."
                    : "Select an occurrence to trace this part.")}{" "}
              </p>
              {partId === "queries" && (
                <label className="part-select">
                  Query head
                  <select
                    aria-label="Query head"
                    value={head}
                    onChange={(e) => setHead(Number(e.target.value))}
                  >
                    {Array.from({ length: 8 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Query {i + 1}
                      </option>
                    ))}
                  </select>
                  <span>
                    Query {head} reads KV head{" "}
                    {settings.gqa ? Math.floor((head - 1) / 4) + 1 : head}. All
                    eight execute together.
                  </span>
                </label>
              )}
              {event && (
                <dl className="operation-values">
                  <dt>Represented workload</dt>
                  <dd>
                    {event.subjects.length} token/request positions · bounded
                    representative crew
                  </dd>
                  <dt>Input</dt>
                  <dd>{event.input}</dd>
                  <dt>Output on completion</dt>
                  <dd>{event.output}</dd>
                </dl>
              )}
              {selected && (
                <div className="occurrence-controls">
                  <button
                    disabled={previous === undefined}
                    onClick={() => previous !== undefined && onSeek(previous)}
                  >
                    Previous occurrence
                  </button>
                  <button
                    disabled={next === undefined}
                    onClick={() => next !== undefined && onSeek(next)}
                  >
                    Next occurrence
                  </button>
                </div>
              )}
            </>
          )}
          <p className="inspector-detail">
            {run.tokens.length} input tokens · {run.output.length} output tokens
            <br />
            {stats.used}/{stats.reserved} KV slots ·{" "}
            {run.jobs.filter((j) => j.status === "active").length}/
            {settings.batchSize} lanes
          </p>
        </section>
        <small className="lesson-footnote">
          A teaching model, not a real AI. Representative machinery; no loaded
          weights.
        </small>
        <small className="sr-only">
          REPRESENTATIVE FEATURE LANES / WEIGHT BANKS · NO LOADED WEIGHTS OR GPU
          TIMINGS
        </small>
      </details>
    </aside>
  );
}
