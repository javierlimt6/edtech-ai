import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Box,
  Braces,
  ChevronDown,
  Cpu,
  Eye,
  Focus,
  Gauge,
  Layers3,
  Maximize2,
  MousePointer2,
  Settings2,
  Sparkles,
  Terminal,
  Wind,
  X,
} from "lucide-react";
import { DEFAULTS, idleRun, memory, preset, STATIONS } from "./sim";
import type { Settings } from "./sim";
import type { CameraMode } from "./World";
import Inspector from "./Inspector";
import Intro from "./Intro";
import PromptDeck from "./PromptDeck";
import { EXHIBITS } from "./flow";
import { buildTrace, traceFrame, PARTS } from "./trace";
import type { Trace, Point } from "./trace";
const World = lazy(() => import("./World"));
const ICONS = [Braces, Layers3, Cpu, Sparkles, Gauge, Terminal];
const OPTIMIZATIONS = [
  {
    key: "kvCache",
    name: "KV cache",
    tag: "REUSE",
    detail:
      "Reuse prior context. Off: recompute the growing context every decode pass.",
  },
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
  const [trace, setTrace] = useState<Trace | null>(null);
  const [cursor, setCursor] = useState(0);
  const frame = trace ? traceFrame(trace, cursor) : null;
  const run = frame?.run ?? idleRun();
  const prompt = "How does AI come up with an answer?";
  const [started, setStarted] = useState(false);
  const [introOrigin, setIntroOrigin] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (started) document.getElementById("lesson-play")?.focus();
  }, [started]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>("guided");
  const [focus, setFocus] = useState("overview");
  const [cameraRevision, setCameraRevision] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [popupPart, setPopupPart] = useState<string | null>(null);
  const [partFocus, setPartFocus] = useState<Point | null>(null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [flightLocked, setFlightLocked] = useState(false);
  const [flightError, setFlightError] = useState("");
  const [hud, setHud] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const stats = useMemo(
    () => frame?.cache ?? memory(run, settings),
    [frame?.cache, run, settings],
  );
  const phaseStation = EXHIBITS.find(
    (station) => station.id === frame?.event?.station,
  );
  const inspected = EXHIBITS.find(
    (station) =>
      station.id ===
      (PARTS.find((p) => p.id === selectedPart)?.station ?? focus),
  );
  const inspecting = cameraMode === "guided" && inspected;
  const activeStation =
    cameraMode === "follow" ? phaseStation : (inspected ?? phaseStation);
  const inspectionPart =
    cameraMode === "fly"
      ? flightLocked
        ? hovered
        : selectedPart
      : cameraMode === "follow"
        ? (frame?.event?.part ?? selectedPart)
        : (selectedPart ??
          (focus === "overview"
            ? frame?.event?.part
            : PARTS.find((p) => p.station === focus)?.id) ??
          null);
  const inspectionTarget =
    PARTS.find((p) => p.id === inspectionPart)?.station ??
    (cameraMode === "guided" ? inspected?.id : phaseStation?.id) ??
    null;
  const optimizationCount = OPTIMIZATIONS.filter(
    (option) =>
      settings[option.key] && (option.key !== "paged" || settings.kvCache),
  ).length;

  useEffect(() => {
    if (!running) return;
    let previousTime = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const seconds = Math.min((now - previousTime) / 1000, 0.1) * speed;
      previousTime = now;
      setCursor((previous) =>
        Math.min(trace?.events.length ?? 0, previous + seconds / 3),
      );
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [running, trace, speed]);
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
        !(event.target as HTMLElement).closest("dialog") &&
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
  useEffect(() => {
    const step = (event: KeyboardEvent) => {
      if (
        !started ||
        !trace ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !(event.target instanceof HTMLElement) ||
        event.target.closest(
          "input, textarea, select, [contenteditable], dialog",
        ) ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      )
        return;
      event.preventDefault();
      if (cameraMode !== "fly") {
        setCameraMode("follow");
        setSelectedPart(null);
      }
      setRunning(false);
      setCursor((position) =>
        event.key === "ArrowLeft"
          ? Math.max(0, Math.ceil(position) - 1)
          : Math.min(trace.events.length, Math.floor(position) + 1),
      );
    };
    window.addEventListener("keydown", step);
    return () => window.removeEventListener("keydown", step);
  }, [started, trace, cameraMode]);
  const chooseMode = (mode: CameraMode) => {
    setCameraMode(mode);
    setHovered(null);
    setFlightError("");
    if (mode !== "fly") setFlightLocked(false);
  };
  const selectStation = (id: string) => {
    setRunning(false);
    setSelectedPart(null);
    setFocus(id);
    chooseMode("guided");
    setCameraRevision((value) => value + 1);
  };
  const selectPart = (id: string) => {
    setPartFocus(null);
    setRunning(false);
    setSelectedPart(id);
    setFocus(id);
    chooseMode("guided");
    setCameraRevision((value) => value + 1);
  };
  const seek = (position: number) => {
    if (cameraMode !== "fly") {
      chooseMode("follow");
      setSelectedPart(null);
    }
    setRunning(false);
    setCursor(position);
  };
  const configure = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setRunning(false);
    setSelectedPart(null);
    setHovered(null);
    setFocus("overview");
    chooseMode("guided");
    if (trace) {
      setTrace(buildTrace(trace.initial.prompt, next));
      setCursor(0);
      setNotice("Run restarted and paused with your new configuration.");
    }
  };
  const send = () => {
    if (!prompt.trim()) return;
    setTrace(buildTrace(prompt, settings));
    setCursor(0);
    setRunning(false);
    setSelectedPart(null);
    setNotice("");
    if (cameraMode !== "fly") chooseMode("follow");
  };
  const reset = () => {
    setTrace(null);
    setCursor(0);
    setRunning(false);
    setNotice("");
    setFocus("overview");
    setSelectedPart(null);
    chooseMode("guided");
    setCameraRevision((value) => value + 1);
  };

  return (
    <main
      className={`sandbox lesson-shell ${started ? "" : "is-intro"} ${inspectionTarget ? "has-inspector" : ""} ${panelOpen ? "lab-open" : ""} ${hud ? "" : "hud-hidden"} ${flightLocked ? "flight-locked" : ""}`}
    >
      {!started && (
        <Intro
          prompt={prompt}
          onStart={(origin) => {
            setIntroOrigin(origin);
            setStarted(true);
            send();
          }}
          onDismiss={() => setStarted(true)}
        />
      )}
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
            cache={stats}
            settings={settings}
            cameraMode={cameraMode}
            focus={focus}
            cameraRevision={cameraRevision}
            reduced={reduced}
            onStation={selectStation}
            inspected={inspectionPart}
            event={frame?.event}
            progress={frame?.progress ?? 0}
            partFocus={partFocus}
            popupPart={popupPart}
            onClosePopup={() => {
              setPopupPart(null);
              setPartFocus(null);
              if (popupPart)
                setFocus(PARTS.find((p) => p.id === popupPart)!.station);
              setCameraRevision((value) => value + 1);
            }}
            onPart={(id, point) => {
              selectPart(id);
              setPartFocus(point ?? null);
              setPopupPart(id);
            }}
            onInspect={setHovered}
            onFlightChange={setFlightLocked}
            onFlightError={setFlightError}
          />
        </Suspense>
      </div>
      <header className="world-header hud">
        <a className="brand" href="/prototype/inside-the-machine">
          <span className="brand-icon">
            <Box size={25} />
          </span>
          <span>
            vis<span className="brand-accent">.ai</span>
            <small>INSIDE THE MACHINE / WORLD 001</small>
          </span>
        </a>
        <div className="world-status">
          <i /> REDSTONE FLATLANDS <span>/</span> CREATIVE SANDBOX
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
            <b>{optimizationCount} / 5 ON</b>
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
                    disabled={option.key === "paged" && !settings.kvCache}
                    className="toggle"
                    onClick={() =>
                      configure({ [option.key]: !settings[option.key] })
                    }
                  >
                    <span />
                  </button>
                </div>
                <p id={`${option.key}-detail`}>
                  {option.key === "paged" && !settings.kvCache
                    ? "Requires KV cache. Your paging preference is retained."
                    : option.detail}
                </p>
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
          <div
            className="work-counters"
            aria-label="Illustrative work counters"
          >
            <span>YOUR PROMPT</span>
            <dl>
              <div>
                <dt>Token positions processed</dt>
                <dd>{run.work.processed}</dd>
              </div>
              <div>
                <dt>Prior positions recomputed</dt>
                <dd>{run.work.recomputed}</dd>
              </div>
              <div>
                <dt>Context tokens reused</dt>
                <dd>{run.work.cacheReads}</dd>
              </div>
              <div>
                <dt>Target passes</dt>
                <dd>{run.passes}</dd>
              </div>
              <div>
                <dt>Drafted / verified</dt>
                <dd>
                  {run.work.drafted} / {run.work.verified}
                </dd>
              </div>
            </dl>
            <span>ALL 8 REQUESTS</span>
            <dl>
              <div>
                <dt>Idle lane steps</dt>
                <dd>{run.work.idleLanes}</dd>
              </div>
              <div>
                <dt>Lane utilization</dt>
                <dd>
                  {run.work.laneSteps
                    ? Math.round(
                        (run.work.occupiedLanes / run.work.laneSteps) * 100,
                      )
                    : 0}
                  %
                </dd>
              </div>
              <div>
                <dt>Peak KV slots / unused</dt>
                <dd>
                  {run.work.peakReserved} / {run.work.peakUnused}
                </dd>
              </div>
            </dl>
          </div>
          <div className="panel-bottom">
            <span>
              <i /> MODEL: TOY TRANSFORMER
            </span>
            <small>Configuration changes restart the run.</small>
          </div>
        </aside>
      )}

      <details className="camera-controls hud">
        <summary>Explore the world</summary>
        <div aria-label="Camera controls">
          <button
            className={cameraMode === "guided" ? "selected" : ""}
            onClick={() => {
              setRunning(false);
              setSelectedPart(null);
              setFocus("overview");
              chooseMode("guided");
              setCameraRevision((value) => value + 1);
            }}
          >
            <MousePointer2 size={14} /> Guided
          </button>
          <button
            className={cameraMode === "follow" ? "selected" : ""}
            onClick={() => chooseMode("follow")}
          >
            <Focus size={14} /> Follow
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
              : "SELECT A STATION OR PART TO INSPECT"}
          </span>
          <div
            className="exhibit-controls"
            aria-label="Explore optimization exhibits"
          >
            {EXHIBITS.slice(6).map((exhibit) => (
              <button
                key={exhibit.id}
                aria-label={`Inspect ${exhibit.name}`}
                aria-pressed={inspectionTarget === exhibit.id}
                onClick={() => selectStation(exhibit.id)}
              >
                {exhibit.name}
              </button>
            ))}
          </div>{" "}
        </div>
      </details>
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

      {started && (
        <Inspector
          overview={cameraMode === "guided" && focus === "overview"}
          target={inspectionTarget ?? "tokenize"}
          stats={stats}
          run={run}
          settings={settings}
          running={running}
          partId={inspectionPart}
          trace={trace}
          cursor={cursor}
          onExplain={(id) => {
            selectPart(id);
            setPopupPart(id);
          }}
          onPart={selectPart}
          onSeek={seek}
        />
      )}

      {started && (
        <PromptDeck
          origin={introOrigin}
          prompt={prompt}
          run={run}
          running={running}
          trace={trace}
          cursor={cursor}
          speed={speed}
          reduced={reduced}
          onSpeed={setSpeed}
          onSeek={seek}
          onReset={reset}
          notice={notice}
          onDismiss={() => setNotice("")}
          onReplay={() => {
            seek(0);
            chooseMode("follow");
          }}
          onPlay={() => {
            if (!trace) {
              send();
              setRunning(true);
              return;
            }
            if (cursor >= trace.events.length) setCursor(0);
            chooseMode("follow");
            setRunning((value) => !value);
          }}
        />
      )}

      <nav className="station-dock hud" aria-label="Explore inference stages">
        <button
          className={`overview-tile ${focus === "overview" && cameraMode === "guided" ? "active" : ""}`}
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
              className={`station-tile ${cameraMode === "follow" && inspectionTarget === station.id ? "processing" : ""} ${focus === station.id && cameraMode === "guided" ? "active" : ""}`}
              onClick={() => selectStation(station.id)}
              style={
                { "--station-color": station.color } as React.CSSProperties
              }
            >
              <span className="dock-number">0{i + 1}</span>
              <Icon size={23} />
              <span>
                {i + 1}. {station.short}
              </span>
              <small>{station.name}</small>
              {run.phase === station.id && <i />}
            </button>
          );
        })}
      </nav>
      <footer className="world-footer hud">
        <span>REDSTONE WORLD / PROCEDURAL VOXELS</span>
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
