import { useLayoutEffect, useRef } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { EXHIBITS } from "./flow";
import type { Part, TraceEvent } from "./trace";

export default function PartPopup({
  part,
  reduced,
  event,
  onClose,
}: {
  part: Part;
  reduced: boolean;
  event?: TraceEvent;
  onClose: () => void;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const line = useRef<SVGLineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    let frame = 0;
    const position = () => {
      const origin = anchor.current!.getBoundingClientRect();
      const width = dialog.offsetWidth;
      const height = dialog.offsetHeight;
      const rightEdge =
        window.innerWidth > 900
          ? window.innerWidth -
            Math.min(480, Math.max(360, window.innerWidth * 0.32)) -
            36
          : window.innerWidth - 16;
      const x = Math.max(16, Math.min(origin.x + 30, rightEdge - width));
      const y = Math.max(
        16,
        Math.min(
          origin.y - height - 28 >= 16 ? origin.y - height - 28 : origin.y + 28,
          window.innerHeight - height - 16,
        ),
      );
      dialog.style.left = `${x}px`;
      dialog.style.top = `${y}px`;
      dialog.style.visibility = "visible";
      const endX = Math.max(x + 12, Math.min(origin.x, x + width - 12));
      const endY = Math.max(y, Math.min(origin.y, y + height));
      line.current?.setAttribute("x1", String(origin.x));
      line.current?.setAttribute("y1", String(origin.y));
      line.current?.setAttribute("x2", String(endX));
      line.current?.setAttribute("y2", String(endY));
      dot.current?.setAttribute("cx", String(origin.x));
      dot.current?.setAttribute("cy", String(origin.y));
      frame = requestAnimationFrame(position);
    };
    position();
    dialog
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      dialog.close();
    };
  }, []);
  return (
    <span ref={anchor}>
      <dialog
        ref={ref}
        className="part-popup"
        aria-labelledby="part-popup-title"
        onCancel={onClose}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <svg className="part-popup-leader" aria-hidden="true">
          <line ref={line} />
          <circle ref={dot} r="4" />
        </svg>
        <motion.article
          initial={reduced ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ transformOrigin: "bottom left" }}
        >
          <div className="part-popup-header">
            <span className="lesson-kicker">
              {EXHIBITS.find((s) => s.id === part.station)?.name} / COMPONENT
            </span>
            <button
              autoFocus
              onClick={onClose}
              aria-label="Close component explanation"
            >
              <X size={18} />
            </button>
          </div>
          <h2 id="part-popup-title">{part.name}</h2>
          <p>{part.purpose}</p>
          {event?.part === part.id ? (
            <dl>
              <dt>Input</dt>
              <dd>{event.input}</dd>
              <dt>Output when this step finishes</dt>
              <dd>{event.output}</dd>
            </dl>
          ) : (
            <p className="part-popup-note">
              You’re inspecting this component. Playback is paused at its
              current step.
            </p>
          )}
        </motion.article>
      </dialog>
    </span>
  );
}
