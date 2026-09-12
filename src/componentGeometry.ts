import type { Point } from "./trace";

export type ComponentVoxel = {
  p: Point;
  s: Point;
  c: string;
  stroke?: boolean;
};

// Silhouettes encode the operation; red indicates activity across every family.
export function componentGeometry(
  id: string,
  active: boolean,
): ComponentVoxel[] {
  const blocks: ComponentVoxel[] = [];
  const stone = "#8f9691",
    wood = "#b78745",
    brass = "#d6ae69";
  const power = active ? "#ff4429" : "#79231c";
  const box = (p: Point, s: Point, c = stone, stroke = false) =>
    blocks.push({ p, s, c, stroke });
  const lamp = (x: number, y: number, z: number) =>
    box([x, y, z], [0.28, 0.28, 0.28], power);
  const branch = (reverse = false) => {
    for (let i = 0; i < 3; i++) {
      const z = i * 0.55 - 0.55;
      const width = reverse ? 1.6 - i * 0.5 : 0.6 + i * 0.5;
      box([0, 1.05, z], [width, 0.22, 0.35], brass);
      for (const x of [-width / 2, width / 2]) lamp(x, 1.3, z);
    }
  };
  const shelf = (x: number, rows: number, width: number) => {
    for (let i = 0; i < rows; i++) {
      box([x, 1 + i * 0.65, 0], [width, 0.58, 1.15], wood);
      box([x, 1 + i * 0.65, 0.61], [width * 0.75, 0.4, 0.12], brass);
      box([x, 1 + i * 0.65, 0.7], [0.25, 0.1, 0.1], "#493b2c");
    }
  };
  switch (id) {
    case "input":
      for (let i = 0; i < 3; i++)
        box([0, 0.9 + i * 0.3, 0], [0.5 + i * 0.5, 0.25, 0.5 + i * 0.5]);
      for (const x of [-0.8, 0.8]) box([x, 1.8, 0], [0.18, 0.5, 1.8]);
      for (const z of [-0.8, 0.8]) box([0, 1.8, z], [1.8, 0.5, 0.18]);
      break;
    case "split":
      branch();
      box([0, 1.8, 0], [0.15, 1.1, 1.5], stone, active);
      break;
    case "stamp":
      box([0, 1, 0], [1.6, 0.25, 1.5], wood);
      for (const x of [-0.7, 0.7]) box([x, 1.7, 0], [0.2, 1.3, 0.3]);
      box([0, 2.4, 0], [1.8, 0.25, 0.5]);
      box([0, 1.6, 0], [0.8, 0.4, 0.8], brass, active);
      break;
    case "lookup":
      shelf(0, 3, 1.6);
      lamp(0.55, 2.4, 0.72);
      break;
    case "vector":
      for (let i = 0; i < 4; i++) {
        box(
          [(i - 1.5) * 0.4, 1 + i * 0.23, 0],
          [0.26, 0.3 + i * 0.46, 0.7],
          brass,
        );
        lamp((i - 1.5) * 0.4, 1.25 + i * 0.46, 0.4);
      }
      box([0, 0.9, 0.7], [1.7, 0.16, 0.18], power);
      break;
    case "keys":
      shelf(-0.55, 2, 0.75);
      shelf(0.55, 3, 0.75);
      box([0, 0.85, 0.8], [1.7, 0.16, 0.16], power);
      break;
    case "queries":
      for (const x of [-0.65, 0.65]) {
        box([x, 1.25, 0], [0.3, 1, 0.4]);
        lamp(x, 1.85, 0);
        box([x / 2, 1.1, 0.45], [0.7, 0.15, 0.2], power);
      }
      box([0, 1.25, 0.75], [0.6, 0.5, 0.6], brass, active);
      break;
    case "mix":
      branch(true);
      box([0, 1.25, 0.9], [0.6, 0.65, 0.45], wood, active);
      break;
    case "expand":
    case "compress":
      for (let i = 0; i < 3; i++) {
        const width = id === "expand" ? 0.55 + i * 0.55 : 1.65 - i * 0.55;
        box([0, 1 + i * 0.45, 0], [width, 0.3, 1.2], brass, i === 2 && active);
        lamp(width / 2, 1 + i * 0.45, 0.65);
      }
      break;
    case "activate":
      for (const x of [-0.65, 0.65]) box([x, 1.35, 0], [0.3, 1.3, 0.7]);
      for (let i = 0; i < 4; i++)
        box(
          [(i - 1.5) * 0.35, 1 + Math.max(0, i - 1) * 0.45, 0.45],
          [0.35, 0.2, 0.25],
          power,
        );
      box([0, 2.05, 0], [1.6, 0.2, 0.7], brass, active);
      break;
    case "candidates":
      for (let i = 0; i < 3; i++) {
        const h = [0.65, 1.65, 1][i];
        box([(i - 1) * 0.6, 0.75 + h / 2, 0], [0.42, h, 0.65], wood);
        box(
          [(i - 1) * 0.6, 0.75 + h / 2, 0.36],
          [0.3, h * 0.8, 0.1],
          active ? "#fff09b" : brass,
        );
      }
      break;
    case "temperature":
      box([0, 1.55, 0], [0.5, 1.8, 0.5]);
      for (let i = 0; i < 4; i++)
        box([0.4, 1 + i * 0.35, 0.3], [0.45, 0.08, 0.1], brass);
      box([0, 1.2, 0.4], [0.7, 0.25, 0.3], power, active);
      break;
    case "topk":
      for (let i = 0; i < 3; i++) {
        box([(i - 1) * 0.55, 1.35, 0], [0.16, 1.25, 0.5]);
        lamp((i - 1) * 0.55, 2, 0);
      }
      box([0.3, 1.8, 0.25], [0.95, 0.25, 0.4], brass, active);
      break;
    case "select":
      box([0, 0.95, 0], [1.7, 0.2, 1.7], wood);
      for (const x of [-0.65, 0.65])
        for (const z of [-0.65, 0.65]) lamp(x, 1.2, z);
      box([0, 1.45, 0], [0.7, 0.85, 0.7], brass, active);
      break;
    case "conveyor":
      for (let i = 0; i < 4; i++)
        box([0, 0.95, (i - 1.5) * 0.45], [1.6, 0.3, 0.3]);
      box([0, 1.3, 0], [0.65, 0.4, 0.6], brass, active);
      break;
    case "answer":
      for (const x of [-1.6, 1.6]) box([x, 1.2, 0], [0.22, 1.2, 0.25], wood);
      box([0, 2, 0], [4.6, 1.8, 0.22], brass);
      break;
    case "complete":
      box([0, 1.45, 0], [0.25, 1.4, 0.3]);
      box([0.45, 2, 0], [1.15, 0.6, 0.2], wood);
      for (let i = 0; i < 3; i++) lamp(0.05 + i * 0.35, 2, 0.16);
      break;
    case "store":
      shelf(-0.55, 3, 0.8);
      shelf(0.55, 3, 0.8);
      box([0, 2.7, 0], [2, 0.15, 1.5]);
      break;
    case "pages":
      for (let i = 0; i < 3; i++) {
        box([(i - 1) * 0.3, 1 + i * 0.4, 0], [1.3, 0.16, 1.15], brass);
        lamp((i - 1) * 0.3, 1.15 + i * 0.4, 0.6);
      }
      break;
    case "read":
      for (const x of [-0.65, 0.65]) box([x, 1.1, 0], [0.18, 0.3, 1.5], power);
      box([0, 1.1, -0.7], [1.5, 0.3, 0.18], power);
      box([0, 1.35, 0.65], [0.65, 0.6, 0.5], brass, active);
      break;
    case "lanes":
      for (let i = 0; i < 3; i++) {
        box([(i - 1) * 0.65, 1, 0], [0.4, 0.25, 1.8], wood);
        lamp((i - 1) * 0.65, 1.3, -0.65);
      }
      break;
    case "release":
      box([-0.6, 1.4, 0], [0.3, 1.5, 0.3]);
      box([0.1, 2, 0], [1.7, 0.2, 0.3], brass, active);
      lamp(-0.6, 2.3, 0);
      break;
    case "admit":
      for (const x of [-0.7, 0.7]) box([x, 1.4, 0], [0.3, 1.5, 0.4]);
      box([0, 2.15, 0], [1.8, 0.25, 0.5], brass);
      box([0, 1.3, 0], [1.1, 0.2, 0.3], power, active);
      break;
    case "propose":
      shelf(0, 1, 1.5);
      for (let i = 0; i < 3; i++)
        box(
          [(i - 1) * 0.5, 1.55, 0],
          [0.35, 0.35, 0.35],
          brass,
          i === 2 && active,
        );
      break;
    case "verify":
      for (const x of [-0.5, 0.5]) {
        box([x, 1.3, 0], [0.65, 1.1, 0.8], wood);
        lamp(x, 1.95, 0);
      }
      box([0, 1.15, 0.6], [1.5, 0.2, 0.2], power);
      break;
    case "reject":
      for (let i = 0; i < 3; i++)
        box([(i - 1) * 0.55, 1.65 - i * 0.35, 0], [0.6, 0.25, 1], stone);
      box([-0.6, 1.9, 0], [0.2, 0.7, 1.2], power, active);
      break;
  }
  return blocks;
}
