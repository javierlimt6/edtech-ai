import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  FACTORY,
  FACTORY_LINKS,
  FACTORY_BOUNDS,
  featureLane,
  overviewPosition,
  overviewTarget,
  deliveryRoute,
} from "./layout";
import { componentGeometry } from "./componentGeometry";
import PartPopup from "./PartPopup";
import { Workers } from "./Workers";
import type { Carrier } from "./Workers";
import { memory, STATIONS } from "./sim";
import type { Run, Settings } from "./sim";
import { EXHIBITS, sequenceLabel } from "./flow";
import { PARTS, enabledPart, partPosition } from "./trace";
import type { Part, TraceEvent, Point } from "./trace";
export type CameraMode = "guided" | "follow" | "fly";
export type WorldProps = {
  cache: ReturnType<typeof memory>;
  run: Run;
  settings: Settings;
  cameraMode: CameraMode;
  focus: string;
  cameraRevision: number;
  reduced: boolean;
  inspected: string | null;
  event?: TraceEvent;
  progress: number;
  onInspect: (id: string | null) => void;
  onStation: (id: string) => void;
  onPart: (id: string, point?: Point) => void;
  partFocus?: Point | null;
  popupPart?: string | null;
  onClosePopup: () => void;
  onFlightChange: (locked: boolean) => void;
  onFlightError: (message: string) => void;
};
type Voxel = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  stroke?: boolean;
  partId?: string;
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
    const shade = 225 + noise(i) * 30;
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
function Voxels({
  items,
  glow = false,
  progress = 0,
}: {
  items: Voxel[];
  glow?: boolean;
  progress?: number;
}) {
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
  const moving = useMemo(
    () =>
      items.flatMap((item, index) => (item.stroke ? [{ item, index }] : [])),
    [items],
  );
  useFrame(() => {
    if (!moving.length) return;
    moving.forEach(({ item, index }) => {
      scratch.position.set(...item.p);
      scratch.position.y += Math.sin(progress * Math.PI) * 0.7;
      scratch.scale.set(...item.s);
      scratch.rotation.set(0, 0, 0);
      scratch.updateMatrix();
      ref.current.setMatrixAt(index, scratch.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
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

function FlightInspection({
  onInspect,
  onPart,
  mode,
}: {
  onInspect: WorldProps["onInspect"];
  onPart: WorldProps["onPart"];
  mode: CameraMode;
}) {
  const { camera, scene, gl } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const center = useMemo(() => new THREE.Vector2(), []);
  const previous = useRef<string | null>(null);
  const elapsed = useRef(0);
  useEffect(() => {
    const canvas = gl.domElement;
    const select = () => {
      if (document.pointerLockElement === canvas && previous.current) {
        document.exitPointerLock();
        onPart(previous.current);
      }
    };
    canvas.addEventListener("pointerdown", select);
    return () => canvas.removeEventListener("pointerdown", select);
  }, [gl, onPart]);
  useEffect(() => {
    previous.current = null;
    onInspect(null);
  }, [mode, onInspect]);
  useFrame((_, delta) => {
    if (mode !== "fly") return;
    if (document.pointerLockElement !== gl.domElement) {
      if (previous.current !== null) {
        previous.current = null;
        onInspect(null);
      }
      return;
    }
    elapsed.current += delta;
    if (elapsed.current < 0.1) return;
    elapsed.current = 0;
    ray.setFromCamera(center, camera);
    let target: string | null = null;
    for (const hit of ray.intersectObjects(scene.children, true)) {
      if (!(hit.object instanceof THREE.Mesh)) continue;
      let object: THREE.Object3D | null = hit.object;
      let ignored = false;
      while (object) {
        if (!object.visible || object.userData.ignoreInspection) ignored = true;
        if (object.userData.partId) target = object.userData.partId;
        object = object.parent;
      }
      if (ignored) {
        target = null;
        continue;
      }
      break; // The nearest visible mesh also occludes objects behind it.
    }
    if (target !== previous.current) {
      previous.current = target;
      onInspect(target);
    }
  });
  return null;
}

function Navigation({
  mode,
  partFocus,
  focus,
  phase,
  revision,
  reduced,
  onFlightChange,
  onFlightError,
}: {
  mode: CameraMode;
  partFocus?: Point | null;
  focus: string;
  phase: string;
  revision: number;
  reduced: boolean;
  onFlightChange: (locked: boolean) => void;
  onFlightError: (message: string) => void;
}) {
  const { camera, gl, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (mode === "fly") camera.clearViewOffset();
    else
      camera.setViewOffset(
        size.width,
        size.height,
        size.width > 900
          ? Math.min(480, Math.max(360, size.width * 0.32)) / 2
          : 0,
        size.width > 900 ? 150 : -20,
        size.width,
        size.height,
      );
    camera.updateProjectionMatrix();
  }, [camera, mode, size.width, size.height]);
  const looking = useRef(new THREE.Vector3(0, 0, 0));
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
    const p = PARTS.find((part) => part.id === id);
    const station = EXHIBITS.find((station) => station.id === id);
    if (p) {
      const bounds = FACTORY[p.station];
      if (mode !== "guided") return { close: false, ...bounds };
      const point = partFocus ?? partPosition(p.id);
      return {
        close: false,
        position: point,
        width: bounds.width * 0.75,
        depth: bounds.depth * 0.75,
      };
    }
    return station ? { close: false, ...FACTORY[station.id] } : null;
  }, [mode, phase, focus, partFocus]);
  const destination = useMemo(
    () =>
      target
        ? new THREE.Vector3(
            target.position[0] +
              (target.close
                ? size.width <= 900
                  ? 8
                  : 5
                : target.width * 0.45),
            target.position[1] +
              (target.close
                ? size.width <= 900
                  ? 10
                  : 7
                : Math.max(target.width, target.depth) *
                  (size.width <= 900 ? 1.2 : 1.3)),
            target.position[2] +
              (target.close
                ? size.width <= 900
                  ? 13
                  : 9
                : Math.max(target.width, target.depth) *
                  (size.width <= 900 ? 1.5 : 1.7)),
          )
        : new THREE.Vector3(...overviewPosition),
    [target, size.width],
  );
  const look = useMemo(
    () =>
      target
        ? new THREE.Vector3(
            target.position[0],
            target.position[1] + (target.width >= 40 ? 8 : 2),
            target.position[2],
          )
        : new THREE.Vector3(...overviewTarget),
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
            "Pointer lock is unavailable. Use Guided to explore, or try a desktop browser.",
          ),
        );
    };
    const error = () =>
      onFlightError(
        "Flight could not capture the pointer. Click the world again, or use Guided.",
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
            ? 90
            : 36) * dt;
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
        camera.position.x = THREE.MathUtils.clamp(
          camera.position.x,
          FACTORY_BOUNDS.minX - 20,
          FACTORY_BOUNDS.maxX + 20,
        );
        camera.position.z = THREE.MathUtils.clamp(
          camera.position.z,
          FACTORY_BOUNDS.minZ - 20,
          FACTORY_BOUNDS.maxZ + 40,
        );
      }
      return;
    }
    if (transitioning.current) {
      const alpha = reduced ? 1 : 1 - Math.exp(-dt * 3);
      camera.position.lerp(destination, alpha);
      looking.current.lerp(look, alpha);
      camera.lookAt(looking.current);
      if (
        camera.position.distanceTo(destination) < 0.05 &&
        looking.current.distanceTo(look) < 0.05
      )
        transitioning.current = false;
    }
  });
  return null;
}
function buildLand() {
  const items: Voxel[] = [];
  for (let x = -200; x <= 200; x += 4)
    for (let z = -200; z <= 200; z += 4)
      items.push({
        p: [x, -0.6, z],
        s: [4, 1, 4],
        c: ["#8da078", "#8fa27a", "#91a47c"][Math.floor(noise(x * 91 + z) * 3)],
      });
  return items;
}
const land = buildLand();
function Wire({
  from,
  to,
  powered = false,
}: {
  from: Point;
  to: Point;
  powered?: boolean;
}) {
  const corner: Point = [to[0], from[1], from[2]];
  const raised: Point = [to[0], to[1], from[2]];
  return (
    <group userData={{ ignoreInspection: true }}>
      {[
        [from, corner],
        [corner, raised],
        [raised, to],
      ].map(([a, b], i) => (
        <group key={i}>
          <Box
            p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.03, (a[2] + b[2]) / 2]}
            s={[Math.abs(a[0] - b[0]) + 1.1, 0.12, Math.abs(a[2] - b[2]) + 1.1]}
            color="#d2c8aa"
          />
          <Box
            p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.12, (a[2] + b[2]) / 2]}
            s={[
              Math.abs(a[0] - b[0]) + 0.18,
              Math.abs(a[1] - b[1]) + 0.06,
              Math.abs(a[2] - b[2]) + 0.18,
            ]}
            color={powered ? "#ff3524" : "#9e261c"}
            glow={powered}
          />
        </group>
      ))}
    </group>
  );
}
function SignText({ text }: { text: string }) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 192;
    return c;
  }, []);
  const map = useMemo(() => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [canvas]);
  useEffect(() => {
    let cancelled = false;
    void document.fonts.load('700 44px "Silkscreen"').then(() => {
      if (cancelled) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 512, 192);
      ctx.font = '700 44px "Silkscreen", sans-serif';
      ctx.fillStyle = "#402c17";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines: string[] = [""];
      for (const word of text.split(" ")) {
        const i = lines.length - 1;
        const next = lines[i] ? `${lines[i]} ${word}` : word;
        if (ctx.measureText(next).width > 480 && lines[i]) lines.push(word);
        else lines[i] = next;
      }
      const visible = lines.slice(0, 3);
      visible.forEach((line, i) =>
        ctx.fillText(line, 256, 96 + (i - (visible.length - 1) / 2) * 52, 480),
      );
      map.needsUpdate = true;
    });
    return () => {
      cancelled = true;
    };
  }, [canvas, map, text]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={[0, 2, 0.13]}>
      <planeGeometry args={[4.2, 1.55]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} />
    </mesh>
  );
}

function RedstonePart({ part, props }: { part: Part; props: WorldProps }) {
  const active = props.event?.part === part.id;
  const selected = props.inspected === part.id;
  const t = active && !props.reduced ? props.progress : 0;
  const power = active ? "#ff3925" : "#98251c";
  const geometry = useMemo(
    () => componentGeometry(part.id, active),
    [part.id, active],
  );
  return (
    <group
      position={part.offset}
      userData={{ partId: part.id }}
      onClick={(e) => {
        if (props.cameraMode !== "fly") {
          e.stopPropagation();
          props.onPart(part.id, e.point.toArray());
        }
      }}
    >
      <Box p={[0, 0.38, 0]} s={[1.8, 0.6, 2]} color="#c8c3ae" />
      <Box
        p={[0, 0.73, 0.8]}
        s={[1.4, 0.09, 0.12]}
        color={power}
        glow={active}
      />
      <Voxels items={geometry} progress={t} />
      {part.id === "answer" && (
        <SignText text={props.run.output.slice(-3).join(" ") || "ANSWER"} />
      )}
      {(selected || active) && (
        <lineSegments
          geometry={edges}
          position={[0, 1.4, 0]}
          scale={[2, 2.8, 2.2]}
        >
          <lineBasicMaterial color={selected ? "#ffffff" : "#ff3524"} />
        </lineSegments>
      )}
      {selected &&
        props.cameraMode === "guided" &&
        props.focus !== "overview" && (
          <Html
            style={{ pointerEvents: "none" }}
            position={[0, 3.5, 0]}
            center
            zIndexRange={[19, 0]}
          >
            <span className="part-label">
              {sequenceLabel(part.station)} · {part.name}
            </span>
          </Html>
        )}
    </group>
  );
}
function factoryCarriers(props: WorldProps): Carrier[] {
  const event = props.event;
  if (!event) return [];
  const station = FACTORY[event.station];
  const tokens = event.subjects;
  const identity = tokens[0]?.text ?? props.run.pending[0] ?? "prompt";
  const local = (x: number, z: number): Point => [
    station.position[0] + x,
    station.position[1] + 0.25,
    station.position[2] + z,
  ];
  let count =
    event.heads?.length ??
    (event.station === "ffn"
      ? event.part === "activate"
        ? 32
        : 8
      : event.station === "embed"
        ? 8
        : event.station === "scheduler"
          ? props.settings.batchSize
          : Math.min(4, Math.max(1, tokens.length)));
  if (event.station === "scheduler")
    count = props.run.jobs.filter((j) => j.status === "active").length;
  const carriers: Carrier[] = Array.from({ length: count }, (_, i) => {
    const columns = event.station === "ffn" ? 8 : count;
    const lane =
      event.station === "scheduler"
        ? props.run.jobs.filter((j) => j.status === "active")[i].lane!
        : i % columns;
    const x =
      (lane -
        ((event.station === "scheduler" ? props.settings.batchSize : columns) -
          1) /
          2) *
      (["attention", "ffn", "scheduler"].includes(event.station)
        ? 4
        : event.station === "embed" || event.station === "tokenize"
          ? 3.5
          : event.station === "sample"
            ? 5
            : event.station === "draft"
              ? 6
              : 3);
    const row = Math.floor(i / columns);
    const start =
      event.station === "ffn"
        ? -11 + row * 4
        : event.station === "attention"
          ? -8
          : event.station === "cache"
            ? 2.5
            : event.station === "tokenize"
              ? -1
              : event.station === "scheduler"
                ? -4.3
                : -station.depth / 2 + 4;
    const offset =
      event.station === "tokenize" || event.station === "scheduler"
        ? 0
        : event.station === "embed"
          ? 1.75
          : event.station === "sample" || event.station === "draft"
            ? 1.9
            : 1.65;
    const end = station.depth / 2 - 7;
    let route: Point[] = [
      local(x + offset, start),
      local(x + offset, event.station === "ffn" ? start + 2.8 : end),
    ];
    if (event.part === "expand" || event.part === "vector")
      route = [
        local(0, end + 0.5),
        local(x + offset, end + 0.5),
        local(x + offset, start),
      ];
    if (event.part === "compress" || event.part === "mix")
      route = [
        local(x + offset, start),
        local(x + offset, end + 0.5),
        local(0, end + 0.5),
      ];
    if (event.station === "emit")
      route = [local(-9 + i * 3, 2.8), local(6 + i, 2.8)];
    if (event.station === "scheduler")
      route = route.map((p) => [p[0], station.position[1] + 0.65, p[2]]);
    if (
      event.station === "ffn" ||
      event.station === "attention" ||
      event.station === "embed"
    ) {
      const n = event.station === "ffn" && event.part === "expand" ? i + 24 : i;
      const lane = featureLane(event.station, n);
      const at = (z: number): Point => [
        station.position[0] + lane.x + 1.9,
        station.position[1] + lane.y + 0.25,
        station.position[2] + z,
      ];
      route = [at(lane.z - 2), at(lane.z + 2)];
      if (event.part === "expand" || event.part === "vector") {
        const dock = local(lane.x + 1.9, station.depth / 2 - 6);
        route = [dock, [dock[0], at(lane.z)[1], dock[2]], at(lane.z + 2)];
      }
      if (event.part === "compress" || event.part === "mix")
        route = [
          at(lane.z + 2),
          [
            at(lane.z)[0],
            at(lane.z)[1],
            station.position[2] + station.depth / 2 - 6,
          ],
          local(lane.x + 1.9, station.depth / 2 - 6),
        ];
    }
    return {
      id: `${event.id}-lane-${i}`,
      token:
        event.station === "scheduler"
          ? `R${props.run.jobs.filter((j) => j.status === "active")[i].id + 1}`
          : ["embed", "attention", "ffn"].includes(event.station)
            ? identity
            : (tokens[i % Math.max(1, tokens.length)]?.text ?? identity),
      feature: ["embed", "attention", "ffn"].includes(event.station),
      rejected: event.part === "reject",
      route,
    };
  });
  // A token courier uses the front service aisles; internal workers carry its feature bundles.
  carriers.push({
    id: `${event.id}-delivery`,
    token: identity,
    rejected: event.part === "reject",
    route: deliveryRoute(
      [event.from[0], event.from[1] - 1.25, event.from[2] + 2.4],
      [event.to[0], event.to[1] - 1.25, event.to[2] + 2.4],
    ),
  });
  return carriers;
}

function FactoryMachinery({
  station,
  props,
}: {
  station: keyof typeof FACTORY;
  props: WorldProps;
}) {
  const bounds = FACTORY[station];
  const active = props.event?.station === station;
  const partId = props.event?.part;
  const machines = useMemo(() => {
    const items: Voxel[] = [];
    const component = {
      tokenize: "stamp",
      embed: "vector",
      attention: "queries",
      ffn: "activate",
      sample: "select",
      emit: "conveyor",
      cache: "store",
      scheduler: "admit",
      draft: "verify",
    }[station];
    const add = (p: Point, s: Point, c: string) =>
      items.push({ p, s, c, partId: component });
    const operation = (x: number, z: number, powered: boolean) => {
      for (const voxel of componentGeometry(component, powered)) {
        items.push({
          ...voxel,
          p: [x + voxel.p[0], voxel.p[1], z + voxel.p[2]],
          partId: component,
        });
      }
    };
    const dust = (x: number, z: number, length: number, powered: boolean) => {
      add([x, 0.2, z], [0.3, 0.1, length], powered ? "#f83e23" : "#852219");
      add([x, 0.38, z], [0.8, 0.2, 1.1], "#e4dfca");
      for (const dz of [-0.3, 0.3]) {
        add([x, 0.75, z + dz], [0.16, 0.65, 0.16], "#845a32");
        add(
          [x, 1.1, z + dz],
          [0.3, 0.25, 0.3],
          powered ? "#ff4429" : "#9d2e23",
        );
      }
    };
    const weights = (x: number, z: number, rows: number) => {
      const first = items.length;
      for (let y = 0; y < rows; y++) {
        if (station === "ffn") {
          add([x, 0.9 + y * 1.5, z], [2.2, 1.2, 1.6], "#6e7771");
          for (const dx of [-0.7, 0, 0.7])
            add([x + dx, 0.9 + y * 1.5, z + 0.85], [0.2, 1, 0.15], "#d6ae69");
        } else if (station === "attention") {
          for (const dx of [-0.6, 0.6]) {
            add([x + dx, 0.9 + y * 1.5, z], [0.85, 1.2, 1.6], "#8b7151");
            add(
              [x + dx, 0.9 + y * 1.5, z + 0.85],
              [0.55, 0.55, 0.12],
              dx < 0 ? "#d6ae69" : "#c3c9bd",
            );
          }
        } else {
          add([x, 0.9 + y * 1.5, z], [2.2, 1.35, 1.6], "#81572e");
          add([x, 0.9 + y * 1.5, z + 0.83], [1.9, 1.1, 0.12], "#c2944d");
          add([x, 0.9 + y * 1.5, z + 0.94], [0.55, 0.15, 0.15], "#493b2c");
        }
      }
      for (let i = first; i < items.length; i++)
        items[i].partId =
          station === "embed"
            ? "lookup"
            : station === "attention"
              ? "keys"
              : station === "ffn"
                ? "expand"
                : "propose";
    };
    if (station === "ffn" || station === "attention" || station === "embed") {
      const count = station === "ffn" ? 32 : 8;
      const columns = station === "ffn" ? 8 : 4;
      for (let i = 0; i < count; i++) {
        const lane = featureLane(station, i);
        const start = items.length;
        operation(lane.x, lane.z, active);
        dust(lane.x + 0.9, lane.z + 1.5, 3, active);
        if (station !== "attention")
          weights(lane.x, lane.z - 3, station === "ffn" ? 2 : 3);
        // Translate each complete machine, not just its decoration.
        for (let j = start; j < items.length; j++) items[j].p[1] += lane.y;
        if (i % columns === 0) {
          add(
            [0, lane.y - 0.12, lane.z],
            [station === "ffn" ? 36 : 30, 0.35, station === "ffn" ? 6 : 10],
            "#bcb59d",
          );
          for (const x of station === "ffn" ? [-17, 17] : [-14, 14]) {
            if (lane.y)
              add([x, lane.y / 2, lane.z - 2.5], [0.6, lane.y, 0.6], "#776343");
            add([x, lane.y + 1, lane.z - 2.5], [0.35, 2, 0.35], "#9d7740");
          }
        }
      }
      if (station === "attention") {
        const heads = props.settings.gqa ? 2 : 8;
        for (let i = 0; i < heads; i++) {
          const tier = props.settings.gqa ? i : Math.floor(i / 4);
          const x = props.settings.gqa
            ? (i - 0.5) * 14
            : featureLane("attention", i).x;
          const z = -5 - tier * 7;
          const first = items.length;
          for (const dx of heads === 2 ? [-2.5, 0, 2.5] : [0])
            weights(x + dx, z, 3);
          for (let j = first; j < items.length; j++) items[j].p[1] += tier * 7;
        }
      }
      // Open lift shafts make the height and token handoffs legible.
      const height = station === "ffn" ? 21 : 7;
      for (const x of [-17, 17]) {
        add(
          [x, height / 2, bounds.depth / 2 - 6],
          [0.4, height, 0.4],
          "#8d7150",
        );
        for (let y = 0; y <= height; y += 1)
          add([x, y, bounds.depth / 2 - 6], [1, 0.15, 0.3], "#c5a260");
      }
    } else if (station === "tokenize") {
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 3.5;
        operation(x, -1, active);
        dust(x, 2, 4, active);
      }
      add([-8, 2.8, -5], [5, 0.5, 5], "#626d6c");
      for (const x of [-10.3, -5.7])
        add([x, 3.5, -5], [0.45, 1.5, 5], "#858f89");
      for (const z of [-7.3, -2.7])
        add([-8, 3.5, z], [5, 1.5, 0.45], "#858f89");
    } else if (station === "sample") {
      for (let i = 0; i < 3; i++) {
        dust((i - 1) * 5, 1, 5, active);
        operation((i - 1) * 5, 4, active);
      }
    } else if (station === "emit") {
      add([0, 0.7, -2], [20, 0.8, 3], "#6f736c");
      for (let i = -9; i <= 9; i += 2) {
        add([i, 1.15, -2], [1.4, 0.15, 3], "#bb9455");
        dust(i, 1, 3, active);
      }
    } else if (station === "cache") {
      for (let i = 0; i < 4; i++) {
        add([0, 0.35, -2 - i * 2.2], [28, 0.4, 2], "#786342");
        dust(-15, -2 - i * 2.2, 2, active);
      }
    } else if (station === "scheduler") {
      for (let i = 0; i < props.settings.batchSize; i++) {
        const x = (i - (props.settings.batchSize - 1) / 2) * 4;
        dust(
          x,
          0,
          10,
          active &&
            props.run.jobs.some((j) => j.lane === i && j.status === "active"),
        );
        operation(x, -6, active);
      }
    } else if (station === "draft") {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 6;
        weights(x, -6, 2);
        operation(x, -2, active);
        dust(x, 1, 4, active);
        add(
          [x, 2.8, -2],
          [1, 0.5, 1],
          props.run.drafts[i]?.accepted
            ? "#90b953"
            : props.run.drafts[i]?.verified
              ? "#c14a2e"
              : "#d1b05a",
        );
      }
    }
    return items;
  }, [
    station,
    active,
    partId,
    props.settings.gqa,
    props.settings.batchSize,
    props.run.jobs,
    props.run.drafts,
  ]);
  return (
    <group
      onClick={(e) => {
        if (props.cameraMode === "fly" || e.instanceId === undefined) return;
        const id = machines[e.instanceId]?.partId;
        if (id) {
          e.stopPropagation();
          props.onPart(id, e.point.toArray());
        }
      }}
    >
      <Voxels items={machines} progress={props.reduced ? 0 : props.progress} />
      {station === "attention" &&
        Array.from({ length: 8 }, (_, i) => {
          const lane = featureLane("attention", i);
          const x = lane.x;
          const kv = props.settings.gqa ? Math.floor(i / 4) : i;
          return (
            <group
              key={i}
              userData={{ partId: "queries" }}
              onClick={(e) => {
                if (props.cameraMode !== "fly") {
                  e.stopPropagation();
                  props.onPart("queries", e.point.toArray());
                }
              }}
            >
              <Wire
                from={[x, lane.y, lane.z + 2]}
                to={[7.5, 0, 11]}
                powered={partId === "mix"}
              />
              <Wire
                from={[x, lane.y, lane.z - 1]}
                to={[
                  props.settings.gqa
                    ? (kv - 0.5) * 14
                    : featureLane("attention", kv).x,
                  lane.y,
                  lane.z - 4,
                ]}
                powered={partId === "queries"}
              />
              <mesh position={[x, lane.y + 1.5, lane.z]}>
                <boxGeometry args={[2, 3, 2]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              {props.cameraMode !== "guided" && active && (
                <Html
                  style={{ pointerEvents: "none" }}
                  position={[x, lane.y + 4, lane.z]}
                  center
                  zIndexRange={[16, 0]}
                >
                  <span className="lane-label">Q{i + 1}</span>
                </Html>
              )}
            </group>
          );
        })}
      {props.cameraMode !== "guided" && active && (
        <Html
          style={{ pointerEvents: "none" }}
          position={[0, 2, bounds.depth / 2 + 1]}
          center
          zIndexRange={[15, 0]}
        >
          <span className="factory-caption">
            {station === "ffn"
              ? "8 → 32 → 8 FEATURES"
              : station === "attention"
                ? `8 QUERY HEADS / ${props.settings.gqa ? 2 : 8} KV BANKS`
                : station === "embed"
                  ? "TOKEN → FEATURE VECTOR"
                  : station === "cache"
                    ? `${props.cache.blocks.length} BLOCKS / ${props.cache.used} KV SLOTS`
                    : station === "scheduler"
                      ? `${props.run.jobs.filter((j) => j.status === "active").length} / ${props.settings.batchSize} LANES`
                      : station === "draft"
                        ? "PROPOSE → VERIFY → KEEP"
                        : station === "sample"
                          ? "SCORE → FILTER → SELECT"
                          : station === "tokenize"
                            ? "TEXT → TOKENS → IDS"
                            : "ONE TOKEN → NEXT PASS"}
          </span>
        </Html>
      )}
    </group>
  );
}

function StationBuild({
  station,
  props,
}: {
  station: (typeof EXHIBITS)[number];
  props: WorldProps;
}) {
  const parts = PARTS.filter(
    (p) => p.station === station.id && enabledPart(p, props.settings),
  );
  const { size } = useThree();
  if (!parts.length) return null;
  const selectedStation = PARTS.find((p) => p.id === props.inspected)?.station;
  const active = props.event?.station === station.id;
  const stats = props.cache;
  const bounds = FACTORY[station.id];
  return (
    <group position={[...station.position]}>
      {station.position[1] > 0 &&
        [-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <Box
              key={`${x}-${z}`}
              p={[
                x * (bounds.width / 2 - 1),
                -station.position[1] / 2,
                z * (bounds.depth / 2 - 1),
              ]}
              s={[1, station.position[1], 1]}
              color="#8c7754"
            />
          )),
        )}
      <Box
        p={[0, 0.02, 0]}
        s={[bounds.width, 0.2, bounds.depth]}
        color="#e3dac3"
      />
      <FactoryMachinery station={station.id} props={props} />
      <Box
        p={[0, 0.15, bounds.depth / 2 - 1]}
        s={[bounds.width - 1, 0.12, 0.35]}
        color="#a72921"
      />
      {parts.map((part) => (
        <RedstonePart key={part.id} part={part} props={props} />
      ))}
      {station.id === "sample" &&
        props.run.candidates.map((candidate, i) => (
          <group key={candidate.text} position={[(i - 1) * 5, 0, -3]}>
            <Box
              p={[0, 1 + candidate.probability * 3, 0]}
              s={[2, 1 + candidate.probability * 6, 2]}
              color={
                props.run.pending.includes(candidate.text)
                  ? "#e85828"
                  : "#e9bd51"
              }
            />
            {(active || selectedStation === "sample") && (
              <Html
                style={{ pointerEvents: "none" }}
                position={[0, 2.5 + candidate.probability * 6, 0]}
                center
                zIndexRange={[15, 0]}
              >
                <span className="part-label">
                  {candidate.text} · {Math.round(candidate.probability * 100)}%
                </span>
              </Html>
            )}
          </group>
        ))}
      {station.id === "cache" && (
        <group position={[0, 0, -1.8]}>
          {props.settings.paged ? (
            stats.blocks.slice(0, 96).map((block, i) => (
              <group
                key={i}
                position={[
                  ((i % 12) - 5.5) * 2.2,
                  1 + Math.floor(i / 48) * 2,
                  -Math.floor((i % 48) / 12) * 2.2,
                ]}
              >
                <Box
                  s={[1.7, 1.6, 1.7]}
                  color={
                    ["#e9b64e", "#53b6cd", "#ed8857", "#9ac65b"][
                      block.owner % 4
                    ]
                  }
                />
                <Box
                  p={[0, 0.85, 0]}
                  s={[0.5, 0.05, Math.max(0.04, (block.tokens / 4) * 0.5)]}
                  color="#fff4be"
                />
              </group>
            ))
          ) : (
            <Box p={[0, 0.5, -0.5]} s={[24, 2.5, 7]} color="#b88d4b" />
          )}
        </group>
      )}
      {station.id === "scheduler" && (
        <group position={[0, 0, -1.8]}>
          {Array.from({ length: props.settings.batchSize }, (_, i) => (
            <group
              key={i}
              position={[(i - (props.settings.batchSize - 1) / 2) * 4, 0, 0]}
            >
              <Box p={[0, 0.4, 0]} s={[3, 0.4, 6]} color="#b4b7ad" />
              {props.settings.continuous && (
                <Box p={[1, 1, -0.65]} s={[0.3, 0.6, 0.2]} color="#dc5c3d" />
              )}
              {((active && props.cameraMode === "follow") ||
                selectedStation === "scheduler") && (
                <Html
                  style={{ pointerEvents: "none" }}
                  position={[0, 0.8, 0.7]}
                  center
                  zIndexRange={[15, 0]}
                >
                  <span className="board-text">
                    {props.run.jobs.find((j) => j.lane === i)?.id !== undefined
                      ? `R${props.run.jobs.find((j) => j.lane === i)!.id + 1}`
                      : "FREE"}
                  </span>
                </Html>
              )}
            </group>
          ))}
          {!props.settings.continuous && (
            <Box
              p={[0, 1, -0.65]}
              s={[props.settings.batchSize * 4, 0.5, 0.2]}
              color="#bb853e"
            />
          )}
        </group>
      )}
      {station.id === "draft" && (
        <>
          <Box p={[0, 0.3, 1.8]} s={[8, 0.2, 0.8]} color="#c4a773" />
          <Box p={[3, 0.5, 2.5]} s={[1.3, 0.8, 1.3]} color="#8c8e85" />
        </>
      )}
      {props.cameraMode === "guided" &&
        props.focus === "overview" &&
        STATIONS.some((s) => s.id === station.id) && (
          <Html
            style={{
              pointerEvents: "auto",
            }}
            position={[0, size.width <= 900 ? 7 : 12, -bounds.depth / 2]}
            center
            zIndexRange={[18, 0]}
          >
            <button
              className="station-label overview-marker"
              aria-label={`${sequenceLabel(station.id)}. ${station.name}`}
              style={{
                pointerEvents: "auto",
              }}
              onClick={() => props.onStation(station.id)}
            >
              {sequenceLabel(station.id)}
            </button>
          </Html>
        )}
    </group>
  );
}
function Scene(props: WorldProps) {
  const visible = EXHIBITS.filter((s) =>
    PARTS.some((p) => p.station === s.id && enabledPart(p, props.settings)),
  );
  const event = props.event;
  const t = props.reduced ? 0 : props.progress;
  const carriers = factoryCarriers(props);
  return (
    <>
      <color attach="background" args={["#91d5fc"]} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#ffffff", "#9dac69", 0.8]} />
      <directionalLight
        position={[-20, 45, 25]}
        intensity={1.3}
        color="#fff5db"
      />
      <Voxels items={land} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.13, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <meshLambertMaterial color="#8fa27a" />
      </mesh>
      <Box p={[-65, 65, -100]} s={[12, 12, 1]} color="#fff6be" glow />
      {FACTORY_LINKS.filter(
        ([from, to]) =>
          visible.some((s) => s.id === from) &&
          visible.some((s) => s.id === to),
      ).map(([from, to]) => {
        const station = EXHIBITS.find((s) => s.id === from)!;
        const next = EXHIBITS.find((s) => s.id === to)!;
        const route = deliveryRoute(
          [
            station.position[0],
            station.position[1] + 0.25,
            station.position[2] + FACTORY[station.id].depth / 2,
          ],
          [
            next.position[0],
            next.position[1] + 0.25,
            next.position[2] + FACTORY[next.id].depth / 2,
          ],
        );
        return route
          .slice(1)
          .map((to, j) => (
            <Wire
              key={`${station.id}-${next.id}-${j}`}
              from={route[j]}
              to={to}
              powered={event?.station === next.id}
            />
          ));
      })}
      {STATIONS.slice(0, -1).map((station, i) => {
        const next = STATIONS[i + 1];
        const x =
          (station.position[0] +
            FACTORY[station.id].width / 2 +
            next.position[0] -
            FACTORY[next.id].width / 2) /
          2;
        return (
          <group
            key={station.id}
            position={[x, 0.3, 27]}
            userData={{ ignoreInspection: true }}
          >
            {[-1, -0.5, 0, 0.5, 1].map((z) => (
              <Box
                key={z}
                p={[1 - Math.abs(z), 0, z]}
                s={[0.6, 0.2, 0.6]}
                color="#b83223"
              />
            ))}
          </group>
        );
      })}
      {visible.map((station) => (
        <StationBuild key={station.id} station={station} props={props} />
      ))}
      <Workers carriers={carriers} progress={t} reduced={props.reduced} />
      {props.popupPart && (
        <Html
          position={props.partFocus ?? partPosition(props.popupPart)}
          style={{ pointerEvents: "none" }}
        >
          <PartPopup
            part={PARTS.find((p) => p.id === props.popupPart)!}
            event={props.event}
            reduced={props.reduced}
            onClose={props.onClosePopup}
          />
        </Html>
      )}
      <FlightInspection
        mode={props.cameraMode}
        onInspect={props.onInspect}
        onPart={props.onPart}
      />
      <Navigation
        mode={props.cameraMode}
        focus={props.focus}
        phase={
          event?.part ?? (props.run.phase === "done" ? "answer" : "overview")
        }
        partFocus={props.partFocus}
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
      camera={{ position: overviewPosition, fov: 48, near: 0.1, far: 2200 }}
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
