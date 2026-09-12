import { useLayoutEffect, useRef } from "react";

export default function Intro({
  prompt,
  onStart,
  onDismiss,
}: {
  prompt: string;
  onStart: (origin: DOMRect) => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="intro-dialog"
      aria-labelledby="intro-title"
      onCancel={onDismiss}
    >
      <div className="intro-card">
        <span className="lesson-kicker">YOUR PROMPT</span>
        <h1 id="intro-title">{prompt}</h1>
        <p>Watch an answer take shape, one step at a time.</p>
        <button
          autoFocus
          className="lesson-primary"
          onClick={() =>
            onStart(
              ref
                .current!.querySelector(".intro-card")!
                .getBoundingClientRect(),
            )
          }
        >
          Process your prompt <span aria-hidden="true">→</span>
        </button>
      </div>
    </dialog>
  );
}
