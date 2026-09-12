import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Box,
  Braces,
  Check,
  ChevronDown,
  Cpu,
  Eye,
  Focus,
  Gauge,
  Layers3,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Sparkles,
  Terminal,
  Wind,
  X,
} from "lucide-react";
import {
  advance,
  begin,
  DEFAULTS,
  idleRun,
  memory,
  outputText,
  preset,
  STATIONS,
} from "./sim";
import type { Run, Settings } from "./sim";
import type { CameraMode } from "./World";
const World = lazy(() => import("./World"));
const ICONS = [Braces, Layers3, Cpu, Sparkles, Gauge, Terminal];
const OPTIMIZATIONS = [
  {
    key: "paged",
    name: "Paged attention",
    tag: "MEMORY",
    detail:
      "Read KV through a page table; allocate blocks as the context grows.",
  },
  {
    key: "gqa",
    name: "Grouped-query attention",
    tag: "ARCHITECTURE",
    detail:
      "8 query heads share 2 KV heads. This changes the toy model architecture.",
  },
  {
    key: "continuous",
    name: "Continuous batching",
    tag: "SCHEDULING",
    detail:
      "Fill a freed lane immediately instead of waiting for the whole batch.",
  },
  {
    key: "speculative",
    name: "Speculative decoding",
    tag: "DECODING",
    detail:
      "Draft up to 3 tokens; verify them and discard guesses after a mismatch.",
  },
] as const;

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [run, setRun] = useState<Run>(idleRun);
  const [prompt, setPrompt] = useState(
    "How does an AI turn my words into an answer?",
  );
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [focus, setFocus] = useState("overview");
  const [cameraRevision, setCameraRevision] = useState(0);
  const [flightLocked, setFlightLocked] = useState(false);
  const [flightError, setFlightError] = useState("");
  const [hud, setHud] = useState(true);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 900);
  const [notice, setNotice] = useState("");
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const stats = useMemo(() => memory(run, settings), [run, settings]);
  const phaseStation = STATIONS.find((station) => station.id === run.phase);
  const inspected = STATIONS.find((station) => station.id === focus);
  const inspecting = cameraMode === "orbit" && inspected;
  const activeStation =
    cameraMode === "follow" ? phaseStation : (inspected ?? phaseStation);
  const active = run.phase !== "idle" && run.phase !== "done";
  const optimizationCount = OPTIMIZATIONS.filter(
    (option) => settings[option.key],
  ).length;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setRun((previous) => advance(previous, settings)),
      1000 / speed,
    );
    return () => clearInterval(timer);
  }, [running, settings, speed]);
  useEffect(() => {
    if (run.phase === "done") setRunning(false);
  }, [run.phase]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    const key = (event: KeyboardEvent) => {
      if (
        event.code === "KeyH" &&
        !/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)
      ) {
        setHud((value) => !value);
      }
    };
    const hidden = () => {
      if (document.hidden) setRunning(false);
    };
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      query.removeEventListener("change", change);
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const chooseMode = (mode: CameraMode) => {
    setCameraMode(mode);
    setFlightError("");
    if (mode !== "fly") setFlightLocked(false);
  };
  const selectStation = (id: string) => {
    setFocus(id);
    chooseMode("orbit");
    setCameraRevision((value) => value + 1);
  };
  const configure = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (run.phase !== "idle") {
      setRun(begin(run.prompt, next));
      setNotice("Run restarted with your new configuration.");
    }
  };
  const send = () => {
    if (!prompt.trim()) return;
    const next = begin(prompt, settings);
    setRun(next);
    setRunning(true);
    setNotice("");
    if (cameraMode !== "fly") chooseMode("follow");
  };
  const reset = () => {
    setRun(idleRun());
    setRunning(false);
    setNotice("");
    setFocus("overview");
    chooseMode("orbit");
    setCameraRevision((value) => value + 1);
  };

  return (
    <main
      className={`sandbox ${hud ? "" : "hud-hidden"} ${flightLocked ? "flight-locked" : ""}`}
    >
      <div
        className="full-world"
        aria-label={`3D inference world. Phase: ${run.phase}. ${run.output.length} output tokens. ${stats.reserved} reserved KV token-head slots.`}
        role="img"
      >
        <Suspense
          fallback={
            <div className="loading-screen">
              <Box size={40} />
              <span>ASSEMBLING THE WORLD</span>
            </div>
          }
        >
          <World
            run={run}
            settings={settings}
            cameraMode={cameraMode}
            focus={focus}
            cameraRevision={cameraRevision}
            reduced={reduced}
            onStation={selectStation}
            onFlightChange={setFlightLocked}
            onFlightError={setFlightError}
          />
        </Suspense>
      </div>
      <div className="vignette" />
      <header className="world-header hud">
        <a className="brand" href="/prototype/inside-the-machine">
          <span className="brand-icon">
            <Box size={25} />
          </span>
          <span>
            INFERENCE<span className="brand-accent">CRAFT</span>
            <small>INSIDE THE MACHINE / WORLD 001</small>
          </span>
        </a>
        <div className="world-status">
          <i /> TRANSFORMER VALLEY <span>/</span> CREATIVE SANDBOX
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={() => {
              setHud(false);
            }}
            aria-label="Hide interface"
            title="Hide interface (H)"
          >
            <Maximize2 size={17} />
          </button>
          <button
            className={`settings-button ${panelOpen ? "on" : ""}`}
            onClick={() => setPanelOpen((value) => !value)}
            aria-expanded={panelOpen}
            aria-controls="engine-panel"
          >
            <Settings2 size={15} /> ENGINE LAB
          </button>
        </div>
      </header>
      <section className="world-title hud">
        <div className="eyebrow">
          <span className="orange-dash" />
          {inspecting
            ? `INSPECTING / ${inspected.name.toUpperCase()}`
            : run.phase === "idle"
              ? "A WORLD BUILT TO BE TAKEN APART"
              : run.phase === "done"
                ? "ONE PROMPT. AN ENTIRE JOURNEY."
                : `${run.output.length === 0 ? "PREFILL" : "DECODE"} / ${phaseStation?.name.toUpperCase()}`}
        </div>
        <h1>
          {inspecting ? (
            <>
              {inspected.name.toUpperCase()}
              <em className="phase-period">.</em>
            </>
          ) : run.phase === "idle" ? (
            <>
              STEP INSIDE
              <br />
              THE <em>ANSWER.</em>
            </>
          ) : run.phase === "done" ? (
            <>
              THOUGHT,
              <br />
              <em>BY THOUGHT.</em>
            </>
          ) : (
            <>
              {phaseStation?.name.toUpperCase()}
              <em className="phase-period">.</em>
            </>
          )}
        </h1>
        <p>
          {inspecting
            ? inspected.description
            : run.phase === "idle"
              ? "Send a prompt. Follow a token. Fly through the machine."
              : run.phase === "done"
                ? `${run.output.length} tokens generated. Change the machine and run it again.`
                : activeStation?.description}
        </p>
        {run.phase === "idle" && !inspecting && (
          <div className="hero-tags">
            <span>
              <Wind size={12} /> FREE FLIGHT
            </span>
            <span>
              <Settings2 size={12} /> LIVE EXPERIMENTS
            </span>
          </div>
        )}
      </section>

      {panelOpen && (
        <aside
          id="engine-panel"
          className="engine-panel hud"
          aria-label="Inference settings"
        >
          <div className="panel-heading">
            <span>
              <Cpu size={15} /> ENGINE LAB
            </span>
            <span>01 / SANDBOX</span>
          </div>
          <label className="control-label" htmlFor="engine">
            INFERENCE PRESET
          </label>
          <div className="select-wrap">
            <select
              id="engine"
              value={settings.engine}
              onChange={(event) =>
                configure(preset(event.target.value as Settings["engine"]))
              }
            >
              <option value="reference">Reference engine</option>
              <option value="vllm">vLLM-style engine</option>
              <option value="speculative">Speculative engine</option>
            </select>
            <ChevronDown size={15} />
          </div>
          <span className="preset-caption">
            Illustrative presets. Every switch is yours.
          </span>
          <div className="settings-metrics">
            <div>
              <span>OUTPUT</span>
              <strong>
                {run.output.length}
                <small>tok</small>
              </strong>
            </div>
            <div>
              <span>KV SLOTS</span>
              <strong>
                {stats.reserved}
                <small>×head</small>
              </strong>
            </div>
            <div>
              <span>ACTIVE</span>
              <strong>
                {run.jobs.filter((job) => job.status === "active").length}
                <small>/{settings.batchSize}</small>
              </strong>
            </div>
          </div>
          <div className="section-heading">
            <span>OPTIMIZATIONS</span>
            <b>{optimizationCount} / 4 ON</b>
          </div>
          <div className="optimization-list">
            {OPTIMIZATIONS.map((option) => (
              <div
                className={`optimization ${settings[option.key] ? "enabled" : ""}`}
                key={option.key}
              >
                <div className="optimization-line">
                  <label htmlFor={option.key}>{option.name}</label>
                  <button
                    id={option.key}
                    role="switch"
                    aria-checked={settings[option.key]}
                    aria-label={option.name}
                    aria-describedby={`${option.key}-detail`}
                    className="toggle"
                    onClick={() =>
                      configure({ [option.key]: !settings[option.key] })
                    }
                  >
                    <span />
                  </button>
                </div>
                <p id={`${option.key}-detail`}>{option.detail}</p>
              </div>
            ))}
          </div>
          <div className="section-heading">
            <span>SAMPLING & SCHEDULING</span>
            <Settings2 size={12} />
          </div>
          <div className="knob">
            <div>
              <label htmlFor="temperature">Temperature</label>
              <output>{settings.temperature.toFixed(1)}</output>
            </div>
            <input
              id="temperature"
              type="range"
              min="0"
              max="2"
              step=".1"
              value={settings.temperature}
              onChange={(event) =>
                configure({ temperature: Number(event.target.value) })
              }
            />
          </div>
          <div className="compact-controls">
            <label>
              Top-k
              <select
                aria-label="Top-k"
                value={settings.topK}
                onChange={(event) =>
                  configure({ topK: Number(event.target.value) })
                }
              >
                {[1, 2, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Output limit
              <select
                aria-label="Output limit"
                value={settings.maxTokens}
                onChange={(event) =>
                  configure({ maxTokens: Number(event.target.value) })
                }
              >
                {[8, 16, 24, 32].map((n) => (
                  <option key={n} value={n}>
                    {n} tokens
                  </option>
                ))}
              </select>
            </label>
            <label>
              Batch size
              <select
                aria-label="Batch size"
                value={settings.batchSize}
                onChange={(event) =>
                  configure({ batchSize: Number(event.target.value) })
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} lanes
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="panel-bottom">
            <span>
              <i /> MODEL: TOY TRANSFORMER
            </span>
            <small>Configuration changes restart the run.</small>
          </div>
        </aside>
      )}

      <div className="camera-controls hud" aria-label="Camera controls">
        <button
          className={cameraMode === "orbit" ? "selected" : ""}
          onClick={() => {
            setFocus("overview");
            chooseMode("orbit");
            setCameraRevision((value) => value + 1);
          }}
        >
          <MousePointer2 size={14} /> Orbit
        </button>
        <button
          className={cameraMode === "follow" ? "selected" : ""}
          onClick={() => chooseMode("follow")}
        >
          <Focus size={14} /> Follow token
        </button>
        <button
          className={cameraMode === "fly" ? "selected" : ""}
          onClick={() => chooseMode("fly")}
        >
          <Wind size={14} /> Fly mode
        </button>
        <span>
          {cameraMode === "fly"
            ? "CLICK WORLD TO ENTER · ESC TO RELEASE"
            : "DRAG TO ROTATE · SCROLL TO ZOOM"}
        </span>
      </div>
      {cameraMode === "fly" && (
        <div className={`flight-instructions ${flightLocked ? "locked" : ""}`}>
          {flightLocked ? (
            <>
              <span className="flight-dot" />
              CREATIVE FLIGHT <kbd>W A S D</kbd> move <kbd>SPACE / E</kbd> up{" "}
              <kbd>Q</kbd> down <kbd>SHIFT</kbd> boost <kbd>ESC</kbd> release{" "}
              <kbd>H</kbd> HUD
            </>
          ) : (
            <>
              <Wind size={15} />
              <strong>Click the world to fly.</strong> WASD + mouse look. Space
              / E up. Q down. Escape releases.
            </>
          )}
        </div>
      )}
      {flightLocked && (
        <div className="crosshair" aria-hidden="true">
          +
        </div>
      )}
      {flightError && (
        <div className="flight-error" role="alert">
          {flightError}
          <button
            onClick={() => setFlightError("")}
            aria-label="Dismiss flight notice"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {!hud && (
        <button className="show-hud" onClick={() => setHud(true)}>
          <Eye size={15} /> Show interface <kbd>H</kbd>
        </button>
      )}

      <section
        className="prompt-deck hud"
        aria-label="Prompt and generated tokens"
      >
        <div className="deck-topline">
          <span>
            <Terminal size={13} /> YOUR PROMPT
          </span>
          <div>
            <span className={`run-indicator ${running ? "running" : ""}`} />
            {run.phase === "idle"
              ? "READY TO EXPLORE"
              : run.phase === "done"
                ? "COMPLETE"
                : running
                  ? "SIMULATION RUNNING"
                  : "PAUSED"}
            <button
              className="reset-button"
              onClick={reset}
              aria-label="Reset simulation"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
        <form
          className="prompt-form"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <label htmlFor="prompt" className="sr-only">
            Prompt
          </label>
          <input
            id="prompt"
            value={prompt}
            maxLength={500}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What do you want the model to think about?"
            autoComplete="off"
          />
          <button
            className="send-button"
            aria-label={active ? "RUN AGAIN" : "SEND PROMPT"}
            type="submit"
            disabled={!prompt.trim()}
          >
            <span>{active ? "RUN AGAIN" : "SEND PROMPT"}</span>
            <ArrowRight size={19} />
          </button>
        </form>
        {run.phase !== "idle" && (
          <>
            <div className="token-strip" aria-label="Input tokens">
              <span>INPUT / {run.tokens.length}</span>
              {run.tokens.slice(0, 18).map((token, i) => (
                <span
                  className="token-chip"
                  key={i}
                  title={`Toy token ID: ${token.id}`}
                >
                  {token.text}
                </span>
              ))}
              {run.tokens.length > 18 && (
                <small>+{run.tokens.length - 18}</small>
              )}
            </div>
            <div className="generated-row">
              <span>OUTPUT / {run.output.length}</span>
              <p aria-live="polite">
                {run.output.length
                  ? outputText(run.output)
                  : "Watching the first token take shape…"}
                {running && <i className="text-caret" />}
              </p>
            </div>
            {settings.speculative && run.drafts.length > 0 && (
              <div className="draft-row">
                <span>DRAFT → VERIFY</span>
                {run.drafts.map((draft, i) => (
                  <span
                    key={i}
                    className={draft.accepted ? "accepted" : "rejected"}
                  >
                    {draft.accepted ? <Check size={10} /> : <X size={10} />}{" "}
                    {draft.text}
                  </span>
                ))}
                <small>
                  {run.accepted} kept · {run.rejected} rejected
                </small>
              </div>
            )}
          </>
        )}
        <div className="transport">
          <div>
            <button
              onClick={() => {
                if (run.phase === "idle" || run.phase === "done") send();
                else setRunning((value) => !value);
              }}
              aria-label={running ? "Pause simulation" : "Play simulation"}
            >
              {running ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => {
                setRunning(false);
                setRun((previous) =>
                  previous.phase === "idle" || previous.phase === "done"
                    ? begin(prompt, settings)
                    : advance(previous, settings),
                );
              }}
              aria-label="Advance one stage"
              disabled={!prompt.trim()}
            >
              <SkipForward size={15} />
            </button>
            <span>SIMULATION SPEED</span>
            <select
              aria-label="Simulation speed"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              {[0.5, 1, 2, 4].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </div>
          <span className="simulation-note">
            ILLUSTRATIVE TOKENS · NO MODEL WEIGHTS LOADED
          </span>
        </div>
        {notice && (
          <p className="configuration-notice" role="status">
            {notice}
            <button
              aria-label="Dismiss configuration notice"
              onClick={() => setNotice("")}
            >
              <X size={11} />
            </button>
          </p>
        )}
      </section>

      <nav className="station-dock hud" aria-label="Explore inference stages">
        <button
          className={`overview-tile ${focus === "overview" && cameraMode === "orbit" ? "active" : ""}`}
          onClick={() => selectStation("overview")}
        >
          <Box size={24} />
          <span>WORLD VIEW</span>
        </button>
        {STATIONS.map((station, i) => {
          const Icon = ICONS[i];
          return (
            <button
              key={station.id}
              className={`station-tile ${run.phase === station.id ? "processing" : ""} ${focus === station.id && cameraMode === "orbit" ? "active" : ""}`}
              onClick={() => selectStation(station.id)}
              style={
                { "--station-color": station.color } as React.CSSProperties
              }
            >
              <span className="dock-number">0{i + 1}</span>
              <Icon size={23} />
              <span>{station.short}</span>
              <small>{station.name}</small>
              {run.phase === station.id && <i />}
            </button>
          );
        })}
        <div className="dock-end">
          <span>NOT A VIDEO.</span>
          <strong>
            A MACHINE
            <br />
            YOU CAN CHANGE
            <ArrowRight size={16} />
          </strong>
        </div>
      </nav>
      <footer className="world-footer hud">
        <span>ORIGINAL VOXEL WORLD / BLENDER + THREE.JS</span>
        <span>VISUAL SIMULATION · NOT GPU BENCHMARKS</span>
        <a
          href="https://docs.vllm.ai/en/latest/design/paged_attention/"
          target="_blank"
          rel="noreferrer"
        >
          UNDER THE HOOD ↗
        </a>
      </footer>
    </main>
  );
}
