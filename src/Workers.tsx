import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Point } from "./trace";

export type Carrier = {
  id: string;
  token: string;
  route: Point[];
  feature?: boolean;
  rejected?: boolean;
};
const cube = new THREE.BoxGeometry(1, 1, 1);
function Block({ p, s, color }: { p: Point; s: Point; color: string }) {
  return (
    <mesh geometry={cube} position={p} scale={s}>
      <meshLambertMaterial color={color} />
    </mesh>
  );
}
export function routePose(route: Point[], progress: number) {
  const distances = route
    .slice(1)
    .map((p, i) => Math.hypot(...p.map((v, j) => v - route[i][j])));
  let remaining =
    distances.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < distances.length; i++) {
    if (remaining <= distances[i] || i === distances.length - 1) {
      const a = route[i],
        b = route[i + 1];
      const t = distances[i] ? remaining / distances[i] : 0;
      return {
        position: a.map((v, j) => v + (b[j] - v) * t) as Point,
        angle: Math.atan2(b[0] - a[0], b[2] - a[2]),
        vertical: Math.abs(b[1] - a[1]) > 0.1,
      };
    }
    remaining -= distances[i];
  }
  return { position: route[0], angle: 0, vertical: false };
}
// Independent presentation layer. SignalCarriers accepts the same activity data.
export function SignalCarriers({
  carriers,
  progress,
}: {
  carriers: Carrier[];
  progress: number;
}) {
  return (
    <group userData={{ ignoreInspection: true }}>
      {carriers.map((c) => (
        <Block
          key={c.id}
          p={
            routePose(c.route, progress).position.map(
              (v, i) => v + (i === 1 ? 1.6 : 0),
            ) as Point
          }
          s={[0.6, 0.6, 0.6]}
          color={c.rejected ? "#b93825" : "#ffe071"}
        />
      ))}
    </group>
  );
}
export function Workers({
  carriers,
  progress,
  reduced,
}: {
  carriers: Carrier[];
  progress: number;
  reduced: boolean;
}) {
  return (
    <group userData={{ ignoreInspection: true }}>
      {carriers.map((c, i) => {
        const pose = routePose(c.route, reduced ? 0 : progress);
        const swing =
          reduced || pose.vertical
            ? 0
            : Math.sin(progress * Math.PI * 8) * 0.55;
        const alex = i % 2 === 1;
        const skin = "#c99065",
          shirt = alex ? "#71964c" : "#26a7af",
          hair = alex ? "#ad572b" : "#462e24";
        return (
          <group
            key={c.id}
            position={pose.position}
            rotation={[0, pose.angle, 0]}
          >
            {pose.vertical && (
              <Block p={[0, -0.1, 0]} s={[1.5, 0.2, 1.5]} color="#b18c51" />
            )}
            {i === 0 && (
              <Html
                style={{ pointerEvents: "none" }}
                position={[0, 3, 0]}
                center
                zIndexRange={[17, 0]}
              >
                <span className="lane-label">
                  {c.token}
                  {c.feature ? " · features" : ""}
                </span>
              </Html>
            )}
            <Block p={[0, 1.8, 0]} s={[0.65, 0.65, 0.65]} color={skin} />
            <Block p={[0, 2.09, -0.03]} s={[0.68, 0.16, 0.68]} color={hair} />
            <Block p={[0, 1.85, -0.3]} s={[0.66, 0.5, 0.12]} color={hair} />
            {[-0.16, 0.16].map((x) => (
              <Block
                key={x}
                p={[x, 1.84, 0.331]}
                s={[0.12, 0.09, 0.02]}
                color="#edf3e7"
              />
            ))}
            {[-0.14, 0.14].map((x) => (
              <Block
                key={x}
                p={[x, 1.84, 0.345]}
                s={[0.06, 0.09, 0.02]}
                color="#315b78"
              />
            ))}
            <Block p={[0, 1.17, 0]} s={[0.7, 0.7, 0.35]} color={shirt} />
            {[-1, 1].map((side) => (
              <group
                key={side}
                position={[side * 0.19, 0.84, 0]}
                rotation={[swing * side, 0, 0]}
              >
                <Block
                  p={[0, -0.37, 0]}
                  s={[0.32, 0.74, 0.34]}
                  color={alex ? "#685443" : "#444698"}
                />
                <Block
                  p={[0, -0.72, 0.06]}
                  s={[0.34, 0.15, 0.47]}
                  color="#3d3c39"
                />
              </group>
            ))}
            {[-1, 1].map((side) => (
              <group
                key={side}
                position={[side * 0.5, 1.46, 0]}
                rotation={[-0.85, 0, side * 0.1]}
              >
                <Block p={[0, -0.15, 0]} s={[0.28, 0.32, 0.32]} color={shirt} />
                <Block p={[0, -0.45, 0]} s={[0.27, 0.3, 0.3]} color={skin} />
              </group>
            ))}
            <Block p={[0, 1.1, 0.65]} s={[0.8, 0.12, 0.65]} color="#6b482b" />
            <Block
              p={[0, 1.4, 0.65]}
              s={[0.48, 0.48, 0.48]}
              color={c.rejected ? "#b93825" : c.feature ? "#69cad3" : "#ffcf54"}
            />
            {c.feature &&
              [-0.17, 0, 0.17].map((x) => (
                <Block
                  key={x}
                  p={[x, 1.67, 0.65]}
                  s={[0.08, 0.12, 0.35]}
                  color="#ecf5b6"
                />
              ))}
          </group>
        );
      })}
    </group>
  );
}
