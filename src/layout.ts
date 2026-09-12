// Shared physical layout: machine bounds, camera targets, and delivery aisles.
export type Position = [number, number, number];
export const FACTORY = {
  tokenize: { position: [-112, 2, 15], width: 24, depth: 18 },
  embed: { position: [-72, 0, 7], width: 34, depth: 34 },
  attention: { position: [-24, 0, 4], width: 40, depth: 40 },
  ffn: { position: [30, 0, 0], width: 44, depth: 48 },
  sample: { position: [78, 3, 13], width: 28, depth: 22 },
  emit: { position: [116, 2, 15], width: 26, depth: 18 },
  cache: { position: [-24, 4, -58], width: 34, depth: 26 },
  scheduler: { position: [-112, 2, -30], width: 28, depth: 20 },
  draft: { position: [78, 4, -35], width: 28, depth: 20 },
} satisfies Record<
  string,
  { position: Position; width: number; depth: number }
>;
const bounds = Object.values(FACTORY);
export const FACTORY_BOUNDS = {
  minX: Math.min(...bounds.map((b) => b.position[0] - b.width / 2)),
  maxX: Math.max(...bounds.map((b) => b.position[0] + b.width / 2)),
  minZ: Math.min(...bounds.map((b) => b.position[2] - b.depth / 2)),
  maxZ: Math.max(...bounds.map((b) => b.position[2] + b.depth / 2)),
};
export const FACTORY_LINKS: [keyof typeof FACTORY, keyof typeof FACTORY][] = [
  ["tokenize", "embed"],
  ["embed", "attention"],
  ["attention", "ffn"],
  ["ffn", "sample"],
  ["sample", "emit"],
  ["emit", "embed"],
  ["attention", "cache"],
  ["scheduler", "tokenize"],
  ["draft", "sample"],
];
export const overviewTarget: Position = [
  (FACTORY_BOUNDS.minX + FACTORY_BOUNDS.maxX) / 2,
  6,
  (FACTORY_BOUNDS.minZ + FACTORY_BOUNDS.maxZ) / 2,
];
const factorySpan = FACTORY_BOUNDS.maxX - FACTORY_BOUNDS.minX;
export const overviewPosition: Position = [
  overviewTarget[0],
  factorySpan * 0.6,
  FACTORY_BOUNDS.maxZ + factorySpan * 1.1,
];
export function machineOffset(
  station: keyof typeof FACTORY,
  offset: Position,
): Position {
  return [offset[0] * 2.5, offset[1], FACTORY[station].depth / 2 - 4];
}
export function deliveryRoute(from: Position, to: Position): Position[] {
  if (Math.abs(from[2] - to[2]) < 0.1 && Math.abs(from[1] - to[1]) < 0.1)
    return [from, to];
  if (Math.abs(from[2] - to[2]) < 0.1)
    return [
      from,
      [from[0], from[1], from[2] + 3],
      [from[0], 0.25, from[2] + 3],
      [to[0], 0.25, to[2] + 3],
      [to[0], to[1], to[2] + 3],
      to,
    ];
  const aisleX = FACTORY_BOUNDS.maxX + 18;
  return [
    from,
    [from[0], from[1], from[2] + 3],
    [from[0], 0.25, from[2] + 3],
    [aisleX, 0.25, from[2] + 3],
    [aisleX, 0.25, to[2] + 3],
    [to[0], 0.25, to[2] + 3],
    [to[0], to[1], to[2] + 3],
    to,
  ];
}

// Repeated work is laid out in real vertical tiers, shared by machines and crews.
export function featureLane(
  station: "ffn" | "attention" | "embed",
  index: number,
) {
  const columns = station === "ffn" ? 8 : 4;
  const tier = Math.floor(index / columns);
  return {
    x: ((index % columns) - (columns - 1) / 2) * (station === "ffn" ? 4 : 7),
    y: tier * 7,
    z: (station === "ffn" ? 1 : -1) - tier * 7,
  };
}
