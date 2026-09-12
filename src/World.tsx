import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { memory, STATIONS } from "./sim";
import type { Phase, Run, Settings, Station } from "./sim";

export type CameraMode = "orbit" | "follow" | "fly";
export type WorldProps = {
  run: Run;
  settings: Settings;
  cameraMode: CameraMode;
  focus: string;
  cameraRevision: number;
  reduced: boolean;
  onStation: (id: string) => void;
  onFlightChange: (locked: boolean) => void;
  onFlightError: (message: string) => void;
};
type Voxel = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
};
const cube = new THREE.BoxGeometry(1, 1, 1);
const edges = new THREE.EdgesGeometry(cube);
const scratch = new THREE.Object3D();
const tint = new THREE.Color();
const noise = (i: number) => {
  const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};
function makeTexture() {
  const data = new Uint8Array(8 * 8 * 4);
  for (let i = 0; i < 64; i++) {
    const shade = 210 + noise(i) * 45;
    data.set([shade, shade, shade, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, 8, 8);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
const texture = makeTexture();
function Voxels({ items, glow = false }: { items: Voxel[]; glow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    items.forEach((item, i) => {
      scratch.position.set(...item.p);
      scratch.scale.set(...item.s);
      scratch.rotation.set(0, 0, 0);
      scratch.updateMatrix();
      ref.current.setMatrixAt(i, scratch.matrix);
      ref.current.setColorAt(i, tint.set(item.c));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[cube, undefined, items.length]}>
      {glow ? <meshBasicMaterial /> : <meshLambertMaterial map={texture} />}
    </instancedMesh>
  );
}
function Box({
  p = [0, 0, 0],
  s = [1, 1, 1],
  color = "#62d4f3",
  glow = false,
}: {
  p?: Voxel["p"];
  s?: Voxel["s"];
  color?: string;
  glow?: boolean;
}) {
  return (
    <mesh geometry={cube} position={p} scale={s}>
      {glow ? (
        <meshBasicMaterial color={color} />
      ) : (
        <meshLambertMaterial color={color} map={texture} />
      )}
    </mesh>
  );
}
function buildLand() {
  const items: Voxel[] = [];
  const add = (p: Voxel["p"], s: Voxel["s"], c: string) =>
    items.push({ p, s, c });
  for (let x = -44; x <= 44; x += 2)
    for (let z = -32; z <= 34; z += 2) {
      const n = noise(x * 40 + z);
      const clearing = Math.abs(x) < 34 && z > -20 && z < 23;
      const river = x < -32 && z > -18;
      const h = clearing ? 0 : Math.floor(n * 3) * 0.7;
      add([x, h - 1.1, z], [2, 2, 2], river ? "#285d70" : "#506f49");
      if (!river) add([x, h - 2.6, z], [2, 1.1 + n, 2], "#665b42");
      if (clearing && (Math.abs(z + 12) < 3 || (z > 8 && z < 18)))
        add([x, -0.055, z], [1.99, 0.12, 1.99], "#52685b");
      if (!clearing && !river && n > 0.74) {
        const height = 3 + noise(x + z) * 4;
        add([x, h + height / 2, z], [0.6, height, 0.6], "#675b42");
        for (let tier = 0; tier < 4; tier++)
          add(
            [x, h + height - 1 + tier * 0.9, z],
            [3.6 - tier * 0.75, 1.1, 3.6 - tier * 0.75],
            ["#396c56", "#427a5e", "#568569", "#709878"][tier],
          );
      } else if (!river && n > 0.87 && !clearing) {
        add([x, h + 0.35, z], [0.2, 0.9, 0.2], "#9aa260");
      }
    }
  // Layered, block-built mountain silhouettes make flight feel like a world, not a diorama.
  for (let i = 0; i < 15; i++) {
    const x = -66 + i * 10;
    const z = -44 - noise(i + 8) * 18;
    const height = 12 + noise(i) * 18;
    for (let level = 0; level < 6; level++) {
      const width = 13 - level * 1.8;
      add(
        [x, (level * height) / 6, z],
        [width, height / 6 + 1, width],
        level > 4 ? "#718b85" : "#324e4e",
      );
    }
  }
  // Copper cabling and power lamps.
  STATIONS.slice(0, -1).forEach((station, i) => {
    const next = STATIONS[i + 1];
    const [x, , z] = station.position;
    const [nx, , nz] = next.position;
    for (let j = 0; j <= 16; j++) {
      const t = j / 16;
      add(
        [x + (nx - x) * t, 0.14, z + (nz - z) * t],
        [0.5, 0.25, 0.5],
        "#728e88",
      );
      if (j % 3 === 0)
        add(
          [x + (nx - x) * t, 0.3, z + (nz - z) * t],
          [0.28, 0.08, 0.28],
          station.color,
        );
    }
  });
  for (let i = 0; i < 12; i++) {
    const x = -30 + i * 5.5;
    add([x, 1.5, 22], [0.25, 3, 0.25], "#475d57");
    add([x, 3.1, 22], [0.65, 0.65, 0.65], "#f0bb71");
    add([x, 3.55, 22], [0.9, 0.18, 0.9], "#425d57");
  }
  return items;
}
const land = buildLand();

function Transformer() {
  const { scene } = useGLTF("/models/transformer-core.glb");
  return <primitive object={scene} />;
}
function Machine({
  station,
  run,
  settings,
  onSelect,
  reduced,
}: {
  station: Station;
  run: Run;
  settings: Settings;
  onSelect: () => void;
  reduced: boolean;
}) {
  const active = run.phase === station.id;
  const core = useRef<THREE.Group>(null!);
  const shell: Voxel[] = useMemo(() => {
    const result: Voxel[] = [];
    const add = (p: Voxel["p"], s: Voxel["s"], c: string) =>
      result.push({ p, s, c });
    add([0, 0.15, 0], [8, 0.5, 7], "#344f52");
    add([0, 0.46, 0], [7.7, 0.12, 6.7], station.color);
    add([0, 0.65, 0], [7.4, 0.25, 6.4], "#263e45");
    if (station.id === "tokenize") {
      for (const x of [-2.6, 2.6]) {
        add([x, 3, 0], [1, 4.7, 1.2], "#ad7950");
        for (let y = 1; y < 6; y++)
          add([x, y, -0.7], [1.15, 0.3, 0.25], "#e3b16c");
      }
      add([0, 5.65, 0], [6.3, 0.8, 1.4], "#d49656");
      add([0, 5.67, 0.72], [4.2, 0.25, 0.05], "#ffdd9a");
      for (let i = 0; i < 6; i++)
        add([0, 0.94, 3 - i], [3.8, 0.25, 0.5], "#667877");
    } else if (station.id === "embed") {
      for (let i = 0; i < 5; i++)
        for (let y = 0; y < 3 + (i % 3); y++) {
          add(
            [(i - 2) * 1.25, 1.3 + y * 1.05, 0],
            [0.87, 0.85, 1.5],
            y % 2 ? "#388c7b" : "#74d2a7",
          );
          add(
            [(i - 2) * 1.25, 1.3 + y * 1.05, 0.79],
            [0.5, 0.38, 0.08],
            "#b6f1cd",
          );
        }
    } else if (station.id === "ffn") {
      for (let i = 0; i < 9; i++) {
        const height = 2 + (4 - Math.abs(i - 4)) * 1.2;
        add(
          [(i - 4) * 0.75, height / 2 + 0.8, 0],
          [0.55, height, 2],
          "#72638e",
        );
        for (let y = 1; y < height; y++)
          add([(i - 4) * 0.75, y + 0.9, 1.02], [0.37, 0.15, 0.1], "#c7b4ee");
      }
      add([0, 1.1, 2], [6, 0.4, 1], "#b09bd1");
    } else if (station.id === "emit") {
      add([0, 2.5, 0], [6, 3.4, 0.6], "#314d56");
      add([0, 2.5, 0.34], [5.3, 2.7, 0.1], "#152d37");
      add([0, 4.4, 0], [6.6, 0.4, 1], "#c2888c");
      for (const x of [-3.1, 3.1]) add([x, 2.6, 0], [0.4, 3.8, 1], "#ac7880");
    }
    return result;
  }, [station]);
  useFrame(({ clock }) => {
    if (core.current && !reduced) {
      core.current.rotation.y = clock.elapsedTime * 0.3;
      core.current.position.y = 4.1 + Math.sin(clock.elapsedTime * 1.4) * 0.15;
    }
  });
  return (
    <group
      position={[...station.position]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {station.id === "attention" ? (
        <Suspense
          fallback={<Box s={[8, 8, 5]} p={[0, 4, 0]} color="#365d67" />}
        >
          <Transformer />
        </Suspense>
      ) : (
        <Voxels items={shell} />
      )}
      {station.id === "attention" && (
        <>
          <HeadLinks grouped={settings.gqa} />
          <group ref={core} position={[0, 4.1, 0]}>
            <Box
              s={[2.1, 2.1, 2.1]}
              color={active ? "#a4f7fa" : "#4bafc4"}
              glow
            />
            <lineSegments geometry={edges} scale={[3.1, 3.1, 3.1]}>
              <lineBasicMaterial color="#9cdae1" />
            </lineSegments>
            <lineSegments
              geometry={edges}
              scale={[4, 4, 4]}
              rotation={[0, Math.PI / 4, Math.PI / 4]}
            >
              <lineBasicMaterial color="#4ba6b6" />
            </lineSegments>
          </group>
          {Array.from({ length: 8 }, (_, i) => (
            <Box
              key={i}
              p={[(i - 3.5) * 0.8, 7.35, -0.5]}
              s={[0.42, 0.42, 0.42]}
              color="#b2eced"
              glow
            />
          ))}
          {Array.from({ length: settings.gqa ? 2 : 8 }, (_, i) => (
            <Box
              key={i}
              p={[(i - (settings.gqa ? 0.5 : 3.5)) * 0.8, 6.2, -0.5]}
              s={[0.6, 0.6, 0.6]}
              color="#f2bb73"
              glow
            />
          ))}
        </>
      )}
      {station.id === "sample" &&
        (run.candidates.length
          ? run.candidates
          : [
              { text: "token", probability: 0.68 },
              { text: "word", probability: 0.24 },
              { text: "idea", probability: 0.08 },
            ]
        ).map((candidate, i) => (
          <group key={i} position={[(i - 1) * 2, 0, 0]}>
            <Box
              p={[0, 1 + candidate.probability * 3, 0]}
              s={[1.25, 0.4 + candidate.probability * 6, 1.25]}
              color={i === 0 ? "#f0ba69" : "#9b805b"}
            />
            <Html
              position={[0, 2 + candidate.probability * 6, 0]}
              center
              zIndexRange={[15, 0]}
            >
              <span className="voxel-word">
                {candidate.text}
                <small>{Math.round(candidate.probability * 100)}%</small>
              </span>
            </Html>
          </group>
        ))}
      {station.id === "tokenize" &&
        run.tokens.slice(0, 6).map((_, i) => (
          <group
            key={i}
            position={[
              ((i % 3) - 1) * 1.05,
              1.5 + Math.floor(i / 3) * 1.1,
              0.5,
            ]}
          >
            <Box s={[0.85, 0.85, 0.85]} color="#ffd18a" glow={active} />
          </group>
        ))}
      {station.id === "emit" && (
        <Html position={[0, 2.7, 0.6]} center zIndexRange={[15, 0]}>
          <span className="output-sign">
            {run.output.slice(-3).join(" ") || "YOUR ANSWER"}
            <small>{run.output.length} TOKENS</small>
          </span>
        </Html>
      )}
      <Html
        position={[0, station.id === "attention" ? 11.5 : 8.6, 0]}
        center
        zIndexRange={[18, 0]}
      >
        <button
          className={`station-label ${active ? "active" : ""}`}
          onClick={onSelect}
          style={{ "--station-color": station.color } as React.CSSProperties}
        >
          <span>{String(STATIONS.indexOf(station) + 1).padStart(2, "0")}</span>
          {station.name}
          {active && <i />}
        </button>
      </Html>
      {active && (
        <pointLight
          position={[0, 4, 3]}
          color={station.color}
          intensity={22}
          distance={13}
          decay={2}
        />
      )}
    </group>
  );
}

function HeadLinks({ grouped }: { grouped: boolean }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < 8; i++)
      points.push(
        (i - 3.5) * 0.8,
        7.35,
        -0.5,
        grouped ? (Math.floor(i / 4) - 0.5) * 0.8 : (i - 3.5) * 0.8,
        6.2,
        -0.5,
      );
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    return result;
  }, [grouped]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#b5dfd5" />
    </lineSegments>
  );
}
const cacheSlot = (index: number, paged: boolean) => {
  const slot = paged ? (index * 17) % 96 : index;
  return [
    ((slot % 16) - 7.5) * 1.02,
    0.85 + Math.floor(slot / 48) * 1.08,
    ((Math.floor(slot / 16) % 3) - 1) * 1.15,
  ] as [number, number, number];
};
function CacheReads({ run, settings }: { run: Run; settings: Settings }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    memory(run, settings)
      .blocks.slice(0, 4)
      .forEach((_, i) => {
        const p = cacheSlot(i, settings.paged);
        points.push(-3 + i * 0.45, 4, -5, 10 + p[0], p[1] + 0.5, -19 + p[2]);
      });
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    return result;
  }, [run, settings]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (run.phase !== "attention") return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#88dfd3" transparent opacity={0.5} />
    </lineSegments>
  );
}
function Cache({ run, settings }: { run: Run; settings: Settings }) {
  const stats = memory(run, settings);
  const pages = stats.blocks.slice(0, 96);
  return (
    <group position={[10, 0, -19]}>
      <Box p={[0, 0.1, 0]} s={[18, 0.4, 7]} color="#304f51" />
      {Array.from({ length: settings.gqa ? 2 : 8 }, (_, i) => (
        <Box
          key={i}
          p={[-8.5 + i * 0.4, 1, -2.7]}
          s={[0.2, 1.3, 0.5]}
          color="#74d6c7"
        />
      ))}
      {(pages.length
        ? pages
        : Array.from({ length: 24 }, () => ({ tokens: 0, owner: 0 }))
      ).map((block, i) => (
        <group key={i} position={cacheSlot(i, settings.paged)}>
          <lineSegments geometry={edges} scale={[0.83, 0.83, 0.83]}>
            <lineBasicMaterial
              color={settings.paged ? "#6dbfb7" : "#a3aa95"}
              transparent
              opacity={0.7}
            />
          </lineSegments>
          {block.tokens > 0 && (
            <Box
              p={[0, -0.38 + block.tokens * 0.1, 0]}
              s={[0.75, block.tokens * 0.19, 0.75]}
              color={
                ["#6cceba", "#f3bf71", "#b0a0d4", "#89aab6"][block.owner % 4]
              }
            />
          )}
        </group>
      ))}
      <Html position={[0, 4, 0]} center zIndexRange={[15, 0]}>
        <div className="world-sign">
          KV CACHE{" "}
          <span>
            {settings.gqa ? "2 SHARED KV HEADS" : "8 KV HEADS"} ·{" "}
            {stats.blocks.length} PAGES
            {stats.blocks.length > 96 ? " · FIRST 96 SHOWN" : ""}
          </span>
        </div>
      </Html>
    </group>
  );
}
function Scheduler({ run, settings }: { run: Run; settings: Settings }) {
  const jobs = run.jobs.length
    ? run.jobs
    : Array.from({ length: 8 }, (_, id) => ({
        id,
        status: "waiting",
        generated: 0,
        target: 8,
      }));
  return (
    <group position={[-23, 0, 17]}>
      <Box p={[0, 0, 0]} s={[12, 0.25, 4]} color="#364e52" />
      {jobs.map((job, i) => (
        <group
          key={job.id}
          position={[
            (i - 3.5) * 1.35,
            0,
            job.status === "active" ? -1 : job.status === "done" ? 1 : 0,
          ]}
        >
          <Box
            p={[0, 0.4, 0]}
            s={[0.7, 0.65, 0.55]}
            color={
              job.status === "active"
                ? "#72dab5"
                : job.status === "done"
                  ? "#648273"
                  : "#a8815b"
            }
          />
          <Box p={[0, 1, 0]} s={[0.65, 0.55, 0.6]} color="#d5b690" />
          <Box p={[0, 1.33, -0.05]} s={[0.7, 0.16, 0.64]} color="#53635a" />
          <Box p={[-0.14, 1.04, 0.32]} s={[0.09, 0.08, 0.04]} color="#233637" />
          <Box p={[0.14, 1.04, 0.32]} s={[0.09, 0.08, 0.04]} color="#233637" />
        </group>
      ))}
      <Html position={[0, 3.3, 0]} center zIndexRange={[15, 0]}>
        <div className="world-sign">
          REQUEST SCHEDULER
          <span>
            {settings.continuous ? "CONTINUOUS" : "STATIC"} BATCHING ·{" "}
            {settings.batchSize} LANES
          </span>
        </div>
      </Html>
    </group>
  );
}
function Stream({
  run,
  settings,
  reduced,
}: {
  run: Run;
  settings: Settings;
  reduced: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const at = Math.max(
    0,
    STATIONS.findIndex((station) => station.id === run.phase),
  );
  const count =
    run.phase === "idle" || run.phase === "done"
      ? 0
      : Math.min(
          16,
          run.output.length === 0 &&
            run.phase !== "sample" &&
            run.phase !== "emit"
            ? Math.max(1, run.tokens.length)
            : settings.speculative
              ? 3
              : 1,
        );
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const a = STATIONS[Math.max(0, at - 1)].position;
    const b = STATIONS[at].position;
    for (let i = 0; i < 16; i++) {
      const t = reduced ? 1 : (clock.elapsedTime * 0.36 + i * 0.1) % 1;
      scratch.position.set(
        THREE.MathUtils.lerp(a[0], b[0], t),
        2.2 + Math.sin(t * Math.PI) * 1.9,
        THREE.MathUtils.lerp(a[2], b[2], t),
      );
      scratch.rotation.set(0, reduced ? 0 : clock.elapsedTime * 0.5, 0);
      scratch.scale.setScalar(i < count ? 0.5 : 0);
      scratch.updateMatrix();
      mesh.current.setMatrixAt(i, scratch.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[cube, undefined, 16]}
      frustumCulled={false}
    >
      <meshBasicMaterial color={STATIONS[at].color} />
    </instancedMesh>
  );
}
function DraftBranch({ run, enabled }: { run: Run; enabled: boolean }) {
  if (!enabled) return null;
  return (
    <group position={[14, 0, 12]}>
      <Box p={[0, 0.5, 0]} s={[5, 1, 4]} color="#605874" />
      <Box p={[0, 2, 0]} s={[2.7, 2.2, 2.7]} color="#927faf" />
      {Array.from({ length: 3 }, (_, i) => (
        <Box
          key={i}
          p={[(i - 1) * 1.2, 4, 0]}
          s={[0.75, 0.75, 0.75]}
          color={run.drafts[i]?.accepted === false ? "#e0806b" : "#c5b8ef"}
          glow
        />
      ))}
      <Html position={[0, 6.4, 0]} center zIndexRange={[15, 0]}>
        <div className="world-sign">
          DRAFT MODEL<span>GUESS → VERIFY → KEEP OR DISCARD</span>
        </div>
      </Html>
    </group>
  );
}

function Navigation({
  mode,
  focus,
  phase,
  revision,
  reduced,
  onFlightChange,
  onFlightError,
}: {
  mode: CameraMode;
  focus: string;
  phase: Phase;
  revision: number;
  reduced: boolean;
  onFlightChange: (locked: boolean) => void;
  onFlightError: (message: string) => void;
}) {
  const { camera, gl } = useThree();
  const orbit = useRef<OrbitImpl>(null!);
  const keys = useRef(new Set<string>());
  const locked = useRef(false);
  const transitioning = useRef(true);
  const direction = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const target = useMemo(() => {
    const id =
      mode === "follow"
        ? phase === "idle"
          ? "tokenize"
          : phase === "done"
            ? "emit"
            : phase
        : focus;
    return STATIONS.find((station) => station.id === id);
  }, [mode, phase, focus]);
  const destination = useMemo(
    () =>
      target
        ? new THREE.Vector3(
            target.position[0] + 13,
            12,
            target.position[2] + 18,
          )
        : new THREE.Vector3(44, 36, 53),
    [target],
  );
  const look = useMemo(
    () =>
      target
        ? new THREE.Vector3(target.position[0], 3, target.position[2])
        : new THREE.Vector3(0, 1.4, 0),
    [target],
  );
  useEffect(() => {
    transitioning.current = true;
  }, [target, revision, mode]);
  useEffect(() => {
    const canvas = gl.domElement;
    const change = () => {
      locked.current = document.pointerLockElement === canvas;
      onFlightChange(locked.current);
      keys.current.clear();
    };
    const down = (event: KeyboardEvent) => {
      if (event.code === "Escape" && locked.current) {
        document.exitPointerLock();
        return;
      }
      if (
        !locked.current ||
        /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)
      )
        return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "Space",
          "KeyQ",
          "KeyE",
          "ShiftLeft",
          "ShiftRight",
        ].includes(event.code)
      ) {
        event.preventDefault();
        keys.current.add(event.code);
      }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const blur = () => keys.current.clear();
    const move = (event: MouseEvent) => {
      if (!locked.current) return;
      const euler = new THREE.Euler(0, 0, 0, "YXZ");
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= event.movementX * 0.002;
      euler.x = THREE.MathUtils.clamp(
        euler.x - event.movementY * 0.002,
        -Math.PI / 2 + 0.02,
        Math.PI / 2 - 0.02,
      );
      camera.quaternion.setFromEuler(euler);
    };
    const request = () => {
      if (mode !== "fly" || locked.current) return;
      const promise = canvas.requestPointerLock();
      if (promise)
        promise.catch(() =>
          onFlightError(
            "Pointer lock is unavailable. Use orbit mode to explore, or try a desktop browser.",
          ),
        );
    };
    const error = () =>
      onFlightError(
        "Flight could not capture the pointer. Click the world again, or use orbit mode.",
      );
    canvas.addEventListener("click", request);
    document.addEventListener("pointerlockchange", change);
    document.addEventListener("pointerlockerror", error);
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    document.addEventListener("mousemove", move);
    window.addEventListener("blur", blur);
    return () => {
      canvas.removeEventListener("click", request);
      document.removeEventListener("pointerlockchange", change);
      document.removeEventListener("pointerlockerror", error);
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      document.removeEventListener("mousemove", move);
      window.removeEventListener("blur", blur);
      keys.current.clear();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [mode, gl, camera, onFlightChange, onFlightError]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (mode === "fly") {
      if (locked.current) {
        camera.getWorldDirection(direction.current);
        right.current.crossVectors(direction.current, camera.up).normalize();
        const speed =
          (keys.current.has("ShiftLeft") || keys.current.has("ShiftRight")
            ? 26
            : 11) * dt;
        if (keys.current.has("KeyW"))
          camera.position.addScaledVector(direction.current, speed);
        if (keys.current.has("KeyS"))
          camera.position.addScaledVector(direction.current, -speed);
        if (keys.current.has("KeyA"))
          camera.position.addScaledVector(right.current, -speed);
        if (keys.current.has("KeyD"))
          camera.position.addScaledVector(right.current, speed);
        if (keys.current.has("Space") || keys.current.has("KeyE"))
          camera.position.y += speed;
        if (keys.current.has("KeyQ")) camera.position.y -= speed;
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.8, 70);
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -85, 85);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -75, 75);
      }
      return;
    }
    if (transitioning.current && orbit.current) {
      const alpha = reduced ? 1 : 1 - Math.exp(-dt * 3);
      camera.position.lerp(destination, alpha);
      orbit.current.target.lerp(look, alpha);
      orbit.current.update();
      if (
        camera.position.distanceTo(destination) < 0.05 &&
        orbit.current.target.distanceTo(look) < 0.05
      )
        transitioning.current = false;
    }
  });
  return mode !== "fly" ? (
    <OrbitControls
      ref={orbit}
      makeDefault
      minDistance={5}
      maxDistance={100}
      maxPolarAngle={Math.PI / 2 - 0.03}
      enableDamping={!reduced}
      dampingFactor={0.08}
      onStart={() => {
        transitioning.current = false;
      }}
    />
  ) : null;
}
function Scene(props: WorldProps) {
  return (
    <>
      <color attach="background" args={["#182f3b"]} />
      <fog attach="fog" args={["#203d47", 65, 155]} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#badbeb", "#4c5c3e", 1.7]} />
      <directionalLight
        position={[-25, 48, 25]}
        intensity={2.3}
        color="#ffdbac"
      />
      <directionalLight
        position={[25, 20, -15]}
        intensity={0.8}
        color="#8bd4e2"
      />
      <Voxels items={land} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.5, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshLambertMaterial color="#2c5053" />
      </mesh>
      <Box p={[-55, 38, -90]} s={[10, 10, 3]} color="#edc185" glow />
      {STATIONS.map((station) => (
        <Machine
          key={station.id}
          station={station}
          run={props.run}
          settings={props.settings}
          reduced={props.reduced}
          onSelect={() => {
            if (props.cameraMode !== "fly") props.onStation(station.id);
          }}
        />
      ))}
      <Cache run={props.run} settings={props.settings} />
      <CacheReads run={props.run} settings={props.settings} />
      <Scheduler run={props.run} settings={props.settings} />
      <DraftBranch run={props.run} enabled={props.settings.speculative} />
      <Stream
        run={props.run}
        settings={props.settings}
        reduced={props.reduced}
      />
      <Navigation
        mode={props.cameraMode}
        focus={props.focus}
        phase={props.run.phase}
        revision={props.cameraRevision}
        reduced={props.reduced}
        onFlightChange={props.onFlightChange}
        onFlightError={props.onFlightError}
      />
    </>
  );
}
export default function World(props: WorldProps) {
  return (
    <Canvas
      camera={{ position: [44, 36, 53], fov: 48, near: 0.1, far: 240 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      fallback={
        <div className="webgl-fallback">
          Enable WebGL / hardware acceleration to enter the world.
        </div>
      }
    >
      <Scene {...props} />
    </Canvas>
  );
}
