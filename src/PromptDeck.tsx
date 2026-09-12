import { motion, useAnimationControls } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { outputText } from "./sim";
import type { Run } from "./sim";
import type { Trace } from "./trace";

export default function PromptDeck({
  prompt,
  run,
  running,
  trace,
  cursor,
  speed,
  reduced,
  origin,
  onSpeed,
  onPlay,
  onSeek,
  onReplay,
  onReset,
  notice,
  onDismiss,
}: {
  prompt: string;
  run: Run;
  running: boolean;
  trace: Trace | null;
  cursor: number;
  speed: number;
  reduced: boolean;
  origin: DOMRect | null;
  onSpeed: (speed: number) => void;
  onPlay: () => void;
  onSeek: (cursor: number) => void;
  onReplay: () => void;
  onReset: () => void;
  notice: string;
  onDismiss: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const animation = useAnimationControls();
  useLayoutEffect(() => {
    if (!origin || reduced || !card.current) return;
    const destination = card.current.getBoundingClientRect();
    animation.set({
      x: origin.x - destination.x,
      y: origin.y - destination.y,
      scaleX: origin.width / destination.width,
      scaleY: origin.height / destination.height,
    });
    void animation.start({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      transition: { duration: 0.5, ease: "easeOut" },
    });
    return () => {
      animation.stop();
      animation.set({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    };
  }, [origin, reduced, animation]);
  return (
    <motion.section
      ref={card}
      animate={animation}
      style={{ transformOrigin: "top left" }}
      className="prompt-deck hud"
      aria-label="Prompt and generated tokens"
    >
      <label className="lesson-kicker" htmlFor="prompt">
        YOUR PROMPT
      </label>
      <input
        id="prompt"
        className="fixed-prompt"
        value={prompt}
        readOnly
        aria-label="Prompt"
      />
      <div className="lesson-answer">
        <span>Answer so far</span>
        <p aria-live="polite">
          {run.output.length
            ? outputText(run.output)
            : "Every answer starts with one token."}
        </p>
      </div>
      <div className="lesson-transport">
        <div className="playback-buttons">
          <button
            aria-label="Previous operation"
            aria-keyshortcuts="ArrowLeft"
            title="Previous step (←)"
            disabled={!trace || cursor <= 0}
            onClick={() => onSeek(Math.max(0, Math.ceil(cursor) - 1))}
          >
            <SkipBack size={16} /> Previous
          </button>
          <button
            id="lesson-play"
            className="lesson-primary"
            onClick={onPlay}
            aria-label={running ? "Pause simulation" : "Play simulation"}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? "Pause" : "Play"}
          </button>
          <button
            aria-label="Next operation"
            aria-keyshortcuts="ArrowRight"
            title="Next step (→)"
            disabled={!trace || cursor >= trace.events.length}
            onClick={() =>
              trace &&
              onSeek(Math.min(trace.events.length, Math.floor(cursor) + 1))
            }
          >
            Next <SkipForward size={16} />
          </button>
        </div>
        <details className="prompt-details">
          <summary>More controls</summary>
          <div className="advanced-playback">
            <div className="token-strip" aria-label="Input tokens">
              <span>INPUT / {run.tokens.length}</span>
              {run.tokens.map((t, i) => (
                <span className="token-chip" key={i}>
                  {t.text}
                </span>
              ))}
            </div>
            {run.drafts.length > 0 && (
              <p>
                Drafts:{" "}
                {run.drafts
                  .map(
                    (d) =>
                      `${d.text} (${d.verified ? (d.accepted ? "kept" : "rejected") : "unverified"})`,
                  )
                  .join(" · ")}
              </p>
            )}
            <label>
              Speed{" "}
              <select
                aria-label="Simulation speed"
                value={speed}
                onChange={(e) => onSpeed(Number(e.target.value))}
              >
                {[0.25, 0.5, 1, 2, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </select>
            </label>
            {trace && (
              <label className="trace-transport">
                Operation{" "}
                {Math.min(Math.floor(cursor) + 1, trace.events.length)} /{" "}
                {trace.events.length}
                <input
                  aria-label="Operation timeline"
                  type="range"
                  min={0}
                  max={trace.events.length}
                  step={1}
                  value={cursor}
                  onChange={(e) => onSeek(Number(e.target.value))}
                />
              </label>
            )}
            <button
              onClick={onReplay}
              disabled={!trace}
              aria-label="Replay simulation"
            >
              <RotateCcw size={14} /> Replay
            </button>
            <button onClick={onReset} aria-label="Reset simulation">
              Reset
            </button>
          </div>
        </details>
      </div>
      {notice && (
        <p className="configuration-notice" role="status">
          {notice}{" "}
          <button aria-label="Dismiss configuration notice" onClick={onDismiss}>
            Dismiss
          </button>
        </p>
      )}
    </motion.section>
  );
}
