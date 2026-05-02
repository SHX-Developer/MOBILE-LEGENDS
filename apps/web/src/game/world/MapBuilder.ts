import * as THREE from 'three';
import {
  MAP_W,
  MAP_H,
  HALF_W,
  HALF_H,
  LANE_WIDTH,
  COLOR_WALL,
  COLOR_TREE_TRUNK,
  COLOR_TREE_LEAVES,
  COLOR_ROCK,
  COLOR_FLOWER,
  BASE_BLUE_X,
  BASE_BLUE_Z,
  BASE_RED_X,
  BASE_RED_Z,
  SPAWN_BLUE_X,
  SPAWN_BLUE_Z,
  SPAWN_RED_X,
  SPAWN_RED_Z,
  SPAWN_ZONE_RADIUS,
  TOWER_LAYOUT,
  LANE_PATHS,
} from '../constants.js';
import { buildBases, Base } from './Bases.js';
import { buildTowers, Tower } from './Towers.js';
import { Colliders } from './Colliders.js';

type Point = readonly [number, number];

export interface MapEntities {
  colliders: Colliders;
  towers: Tower[];
  bases: Base[];
}

const BLUE_BASE: Point = [BASE_BLUE_X, BASE_BLUE_Z];
const RED_BASE: Point = [BASE_RED_X, BASE_RED_Z];
const TOWER_POINTS: ReadonlyArray<Point> = TOWER_LAYOUT.map((tower) => [tower.x, tower.z]);
const LANE_POLYLINES: ReadonlyArray<ReadonlyArray<Point>> = [
  [BLUE_BASE, ...LANE_PATHS.top.blue, RED_BASE],
  [BLUE_BASE, ...LANE_PATHS.mid.blue, RED_BASE],
  [BLUE_BASE, ...LANE_PATHS.bot.blue, RED_BASE],
];

export function buildMap(scene: THREE.Scene): MapEntities {
  const colliders = new Colliders();
  buildGround(scene);
  buildIslandEdges(scene);
  buildPerimeterWalls(scene, colliders);
  buildSpawnZones(scene);
  const bases = buildBases(scene, colliders);
  const towers = buildTowers(scene, colliders);
  buildJungleWalls(scene, colliders);
  buildJungleCamps(scene);
  buildLandmarks(scene, colliders);
  return { colliders, towers, bases };
}

function buildGround(scene: THREE.Scene): void {
  const texture = createBattlefieldTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W, MAP_H, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  addGroundPatch(scene, -32, 32, 50, 44, 0x78ad5d, 0.24);
  addGroundPatch(scene, 32, -32, 50, 44, 0x8f7951, 0.18);
  addGroundPatch(scene, -34, -26, 44, 38, 0x567f54, 0.18);
  addGroundPatch(scene, 34, 26, 44, 38, 0x567f54, 0.18);
  addGroundPatch(scene, 0, 0, 64, 44, 0x4d7a55, 0.14);
  addBasePlaza(scene, BASE_BLUE_X, BASE_BLUE_Z, 0x8fb8cf, 0x4f9dff);
  addBasePlaza(scene, BASE_RED_X, BASE_RED_Z, 0xc1988a, 0xff6b6b);

  for (let i = -48; i <= 48; i += 16) {
    addStripe(scene, i, 0, 0.28, MAP_H - 16, 0x4f7d3d, 0.12);
    addStripe(scene, 0, i, MAP_W - 16, 0.28, 0x4f7d3d, 0.12);
  }
}

function createBattlefieldTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const toPx = ([x, z]: Point): [number, number] => [
    ((x + HALF_W) / MAP_W) * size,
    ((z + HALF_H) / MAP_H) * size,
  ];
  const path = (pts: ReadonlyArray<Point>) => {
    const [sx, sy] = toPx(pts[0]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = toPx(pts[i]);
      ctx.lineTo(x, y);
    }
  };
  const curve = (pts: ReadonlyArray<Point>) => {
    const [sx, sy] = toPx(pts[0]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length - 1; i++) {
      const [cx, cy] = toPx(pts[i]);
      const [nx, ny] = toPx(pts[i + 1]);
      ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
    }
    const [ex, ey] = toPx(pts[pts.length - 1]);
    ctx.lineTo(ex, ey);
  };
  const strokePath = (pts: ReadonlyArray<Point>, width: number, color: string, alpha = 1, curved = false) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    curved ? curve(pts) : path(pts);
    ctx.stroke();
    ctx.restore();
  };
  const fillEllipse = (x: number, z: number, rx: number, rz: number, color: string, alpha = 1) => {
    const [px, py] = toPx([x, z]);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(px, py, (rx / MAP_W) * size, (rz / MAP_H) * size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const grad = ctx.createLinearGradient(0, size, size, 0);
  grad.addColorStop(0, '#5f9850');
  grad.addColorStop(0.34, '#6ea24f');
  grad.addColorStop(0.5, '#4f8758');
  grad.addColorStop(0.68, '#6b9a51');
  grad.addColorStop(1, '#8f6e4d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(38, 82, 62, 0.28)';
  for (const [x, z, rx, rz] of [
    [-34, -28, 20, 16], [32, 28, 20, 16], [-26, 22, 24, 14], [26, -22, 24, 14],
    [-4, 0, 16, 24], [10, 4, 18, 20],
  ] as Array<[number, number, number, number]>) {
    fillEllipse(x, z, rx, rz, '#26523e', 0.22);
  }

  const laneShapes = [
    [BLUE_BASE, [-50, 30], [-50, -34], [-34, -50], [30, -50], RED_BASE],
    [BLUE_BASE, [-28, 28], [-10, 10], [10, -10], [28, -28], RED_BASE],
    [BLUE_BASE, [-34, 50], [34, 50], [50, 34], [50, -30], RED_BASE],
  ] as ReadonlyArray<ReadonlyArray<Point>>;
  for (const pts of laneShapes) {
    strokePath(pts, 108, '#806f4a', 0.36, false);
    strokePath(pts, 82, '#d7bf81', 0.92, false);
    strokePath(pts, 18, '#f4dfa6', 0.28, false);
  }

  const wallShapes: ReadonlyArray<ReadonlyArray<Point>> = [
    [[-42, 15], [-34, 5], [-35, -12], [-27, -25]],
    [[-22, 36], [-9, 31], [3, 25], [12, 17]],
    [[-32, -36], [-17, -33], [-3, -25], [8, -21]],
    [[13, -36], [29, -32], [39, -17]],
    [[-16, -15], [-4, -22], [12, -18]],
    [[-9, 20], [6, 24], [17, 13]],
    [[42, -15], [34, -5], [35, 12], [27, 25]],
    [[22, -36], [9, -31], [-3, -25], [-12, -17]],
    [[32, 36], [17, 33], [3, 25], [-8, 21]],
    [[-13, 36], [-29, 32], [-39, 17]],
    [[16, 15], [4, 22], [-12, 18]],
    [[9, -20], [-6, -24], [-17, -13]],
  ];
  for (const pts of wallShapes) {
    strokePath(pts, 42, '#3f4d46', 0.38, true);
    strokePath(pts, 24, '#828c7e', 0.86, true);
    strokePath(pts, 6, '#b6b9a6', 0.55, true);
  }

  for (const [x, z, color] of [
    [-33, -18, '#6bd1ff'], [-18, -36, '#9b7dff'], [-30, 20, '#7ee06f'],
    [-12, 32, '#ff8a4c'], [-8, -8, '#ffb84d'], [10, 10, '#9b7dff'],
    [33, 18, '#6bd1ff'], [18, 36, '#9b7dff'], [30, -20, '#7ee06f'],
    [12, -32, '#ff8a4c'], [-39, 2, '#61d7a4'], [39, -2, '#61d7a4'],
  ] as Array<[number, number, string]>) {
    const [px, py] = toPx([x, z]);
    ctx.save();
    ctx.fillStyle = 'rgba(45, 55, 34, 0.72)';
    ctx.beginPath();
    ctx.arc(px, py, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const [x, z, color] of [
    [BASE_BLUE_X, BASE_BLUE_Z, '#55b7ff'],
    [BASE_RED_X, BASE_RED_Z, '#ff6969'],
  ] as Array<[number, number, string]>) {
    const [px, py] = toPx([x, z]);
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(px, py, 84, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(34, 55, 48, 0.45)';
  ctx.lineWidth = 44;
  ctx.strokeRect(20, 20, size - 40, size - 40);
  ctx.strokeStyle = 'rgba(165, 148, 105, 0.75)';
  ctx.lineWidth = 16;
  ctx.strokeRect(28, 28, size - 56, size - 56);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addGroundPatch(
  scene: THREE.Scene,
  cx: number,
  cz: number,
  w: number,
  h: number,
  color: number,
  opacity: number,
): void {
  const patch = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(cx, 0.012, cz);
  scene.add(patch);
}

function addBasePlaza(scene: THREE.Scene, x: number, z: number, stone: number, glow: number): void {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(15, 64),
    new THREE.MeshStandardMaterial({ color: stone, roughness: 0.78 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(x, 0.018, z);
  scene.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(12.5, 13.4, 64),
    new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.32, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.042, z);
  scene.add(ring);
}

function addStripe(
  scene: THREE.Scene,
  cx: number,
  cz: number,
  w: number,
  h: number,
  color: number,
  opacity = 0.18,
): void {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, 0.015, cz);
  scene.add(m);
}

function buildIslandEdges(scene: THREE.Scene): void {
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x596760, roughness: 0.95, flatShading: true });
  const grassLipMat = new THREE.MeshStandardMaterial({ color: 0x4f7a44, roughness: 1 });
  const specs: Array<[number, number, number, number]> = [
    [0, -HALF_H - 2.2, MAP_W, 4.4],
    [0, HALF_H + 2.2, MAP_W, 4.4],
    [-HALF_W - 2.2, 0, 4.4, MAP_H],
    [HALF_W + 2.2, 0, 4.4, MAP_H],
  ];
  for (const [x, z, w, h] of specs) {
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(w, 4.5, h), cliffMat);
    cliff.position.set(x, -2.2, z);
    scene.add(cliff);

    const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, h), grassLipMat);
    lip.position.set(x, 0.06, z);
    scene.add(lip);
  }

  const cornerMat = new THREE.MeshStandardMaterial({ color: 0x48534e, roughness: 1, flatShading: true });
  for (const [x, z] of [[-62, -62], [62, -62], [-62, 62], [62, 62]] as Point[]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(5.5, 0), cornerMat);
    rock.scale.set(1.25, 0.7, 1.25);
    rock.position.set(x, -0.8, z);
    scene.add(rock);
  }
}

function buildPerimeterWalls(scene: THREE.Scene, colliders: Colliders): void {
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_WALL, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc1ab8a, roughness: 0.85 });
  const wallH = 3.4;
  const wallT = 3.2;
  const sides: Array<[number, number, number, number]> = [
    [0, -HALF_H - wallT / 2, HALF_W + wallT, wallT / 2],
    [0, HALF_H + wallT / 2, HALF_W + wallT, wallT / 2],
    [-HALF_W - wallT / 2, 0, wallT / 2, HALF_H + wallT],
    [HALF_W + wallT / 2, 0, wallT / 2, HALF_H + wallT],
  ];
  for (const [cx, cz, hw, hz] of sides) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, wallH, hz * 2), mat);
    wall.position.set(cx, wallH / 2, cz);
    scene.add(wall);
    colliders.addRect(cx, cz, hw, hz);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.35, hz * 2), capMat);
    cap.position.set(cx, wallH + 0.175, cz);
    scene.add(cap);
  }

  const postMat = new THREE.MeshStandardMaterial({ color: 0x756756, roughness: 0.8 });
  for (const x of [-HALF_W - wallT / 2, HALF_W + wallT / 2]) {
    for (const z of [-HALF_H - wallT / 2, HALF_H + wallT / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(5, wallH + 1.4, 5), postMat);
      post.position.set(x, (wallH + 1.4) / 2, z);
      scene.add(post);
    }
  }
}

function buildSpawnZones(scene: THREE.Scene): void {
  addSpawnZone(scene, SPAWN_BLUE_X, SPAWN_BLUE_Z, 0x4f9dff, BASE_BLUE_X, BASE_BLUE_Z);
  addSpawnZone(scene, SPAWN_RED_X, SPAWN_RED_Z, 0xff6b6b, BASE_RED_X, BASE_RED_Z);
}

function addSpawnZone(
  scene: THREE.Scene,
  cx: number,
  cz: number,
  color: number,
  baseX: number,
  baseZ: number,
): void {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(SPAWN_ZONE_RADIUS, 56),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(cx, 0.062, cz);
  scene.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SPAWN_ZONE_RADIUS - 0.45, SPAWN_ZONE_RADIUS, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, 0.07, cz);
  scene.add(ring);

  const dirX = -baseX;
  const dirZ = -baseZ;
  const len = Math.hypot(dirX, dirZ);
  const nx = dirX / len;
  const nz = dirZ / len;
  const angle = Math.atan2(nx, nz);
  const arrowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (let i = 0; i < 3; i++) {
    const step = 1.8 + i * 1.5;
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = angle + Math.PI / 2;
    arrow.position.set(cx + nx * step, 0.076, cz + nz * step);
    scene.add(arrow);
  }
}

function buildJungleWalls(scene: THREE.Scene, colliders: Colliders): void {
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x74796f, roughness: 0.98, flatShading: true });

  const chains: Point[][] = [
    [[-39, 12], [-34, 5], [-32, -3], [-35, -12]],
    [[-21, 34], [-12, 31], [-4, 27]],
    [[-27, -31], [-17, -32], [-7, -28]],
    [[8, -34], [18, -35], [29, -31]],
    [[-14, -14], [-7, -19], [2, -21]],
    [[-5, 20], [4, 22], [13, 17]],
    [[39, -12], [34, -5], [32, 3], [35, 12]],
    [[21, -34], [12, -31], [4, -27]],
    [[27, 31], [17, 32], [7, 28]],
    [[-8, 34], [-18, 35], [-29, 31]],
    [[14, 14], [7, 19], [-2, 21]],
    [[5, -20], [-4, -22], [-13, -17]],
  ];

  for (const chain of chains) buildWallChain(scene, colliders, ridgeMat, chain);

  buildMountainCluster(scene, colliders, -42, -38, 0x8f8b7f, 1.25);
  buildMountainCluster(scene, colliders, 42, 38, 0x8f8b7f, 1.25);
  buildMountainCluster(scene, colliders, -54, -18, 0x7f8580, 1.05);
  buildMountainCluster(scene, colliders, 54, 18, 0x7f8580, 1.05);
  buildMountainCluster(scene, colliders, 18, -54, 0x7f8580, 1.05);
  buildMountainCluster(scene, colliders, -18, 54, 0x7f8580, 1.05);
  buildMountainCluster(scene, colliders, -54, 24, 0x7f8580, 0.9);
  buildMountainCluster(scene, colliders, 54, -24, 0x7f8580, 0.9);
}

function buildWallChain(
  scene: THREE.Scene,
  colliders: Colliders,
  ridgeMat: THREE.Material,
  pts: ReadonlyArray<Point>,
): void {
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    if (nearLane(x, z, 2.8) || nearReservedZone(x, z)) continue;
    const next = pts[Math.min(i + 1, pts.length - 1)];
    const prev = pts[Math.max(i - 1, 0)];
    const angle = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
    const scale = 0.9 + (i % 3) * 0.13;
    const boulder = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.55 * scale, 0),
      ridgeMat,
    );
    boulder.position.set(x, 0.9 * scale, z);
    boulder.scale.set(1.45, 0.82, 0.92);
    boulder.rotation.set(0.18 * (i % 2), -angle, 0.08 * ((i % 3) - 1));
    boulder.castShadow = true;
    scene.add(boulder);

    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(0.82 * scale, 1.8 * scale, 7),
      ridgeMat,
    );
    peak.position.set(
      x + Math.cos(angle + Math.PI / 2) * 0.65,
      1.65 * scale,
      z + Math.sin(angle + Math.PI / 2) * 0.65,
    );
    peak.rotation.y = -angle + (i % 2 ? 0.25 : -0.2);
    peak.castShadow = true;
    scene.add(peak);

    if (i < pts.length - 1) {
      const [nx, nz] = pts[i + 1];
      const mx = (x + nx) / 2;
      const mz = (z + nz) / 2;
      if (!nearLane(mx, mz, 2.4) && !nearReservedZone(mx, mz)) {
        const link = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.15 * scale, 0),
          ridgeMat,
        );
        link.position.set(mx, 0.62 * scale, mz);
        link.scale.set(1.7, 0.55, 0.72);
        link.rotation.y = -angle;
        link.castShadow = true;
        scene.add(link);
      }
    }
    colliders.addCircle(x, z, 1.45 * scale);
  }
}

function buildMountainCluster(
  scene: THREE.Scene,
  colliders: Colliders,
  cx: number,
  cz: number,
  color: number,
  scale = 1,
): void {
  const stoneMat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const peaks: Array<[number, number, number]> = [
    [cx, cz, 3.6 * scale],
    [cx + 2.8 * scale, cz - 1.5 * scale, 2.7 * scale],
    [cx - 2.2 * scale, cz + 1.8 * scale, 2.9 * scale],
    [cx + 1.2 * scale, cz + 2.6 * scale, 2.1 * scale],
  ];
  for (const [px, pz, h] of peaks) {
    if (nearLane(px, pz, 3.2) || nearReservedZone(px, pz)) continue;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(1.7 * scale, h, 7), stoneMat);
    peak.position.set(px, h / 2, pz);
    peak.rotation.y = (px * 0.13 + pz * 0.07) % Math.PI;
    peak.castShadow = true;
    scene.add(peak);
    colliders.addCircle(px, pz, 1.35 * scale);
  }
}

function buildJungleCamps(scene: THREE.Scene): void {
  const camps: Array<[number, number, number, number]> = [
    [-32, -18, 0x6bd1ff, 1.2],
    [-18, -36, 0x9b7dff, 1.1],
    [-30, 20, 0x7ee06f, 0.95],
    [-12, 32, 0xff8a4c, 1.0],
    [-8, -8, 0xffb84d, 1.0],
    [10, 10, 0x9b7dff, 1.0],
    [32, 18, 0x6bd1ff, 1.2],
    [18, 36, 0x9b7dff, 1.1],
    [30, -20, 0x7ee06f, 0.95],
    [12, -32, 0xff8a4c, 1.0],
    [-36, 2, 0x61d7a4, 0.9],
    [36, -2, 0x61d7a4, 0.9],
  ];
  for (const [x, z, color, scale] of camps) addJungleCamp(scene, x, z, color, scale);
}

function addJungleCamp(scene: THREE.Scene, x: number, z: number, color: number, scale: number): void {
  if (nearLane(x, z, 1.2) || nearReservedZone(x, z)) return;
  const dirt = new THREE.Mesh(
    new THREE.CircleGeometry(4.6 * scale, 34),
    new THREE.MeshStandardMaterial({ color: 0x6b7040, roughness: 0.95 }),
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(x, 0.034, z);
  scene.add(dirt);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.2 * scale, 3.8 * scale, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.06, z);
  scene.add(ring);

  const core = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.1 * scale, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.18,
      roughness: 0.72,
      flatShading: true,
    }),
  );
  core.position.set(x, 1.0 * scale, z);
  core.castShadow = true;
  scene.add(core);
}

function buildLandmarks(scene: THREE.Scene, colliders: Colliders): void {
  const trees: Array<[number, number, number]> = [
    [-50, -8, 1.1], [-47, 12, 0.9], [-42, 34, 1.0], [-34, -42, 1.15],
    [-20, -24, 0.8], [-18, 18, 0.85], [-3, 34, 0.8], [3, -34, 0.8],
    [20, 24, 0.8], [18, -18, 0.85], [34, 42, 1.15], [42, -34, 1.0],
    [47, -12, 0.9], [50, 8, 1.1], [-10, 48, 0.85], [10, -48, 0.85],
  ];
  for (const [x, z, s] of trees) {
    if (!nearLane(x, z, 1.5 * s) && !nearReservedZone(x, z)) addTree(scene, colliders, x, z, s);
  }

  const rocks: Array<[number, number, number]> = [
    [-39, -25, 1.0], [-25, -39, 0.9], [-39, 26, 0.9], [-24, 8, 0.9],
    [-16, -6, 0.8], [-6, 24, 0.75], [6, -24, 0.75], [16, 6, 0.8],
    [24, -8, 0.9], [39, -26, 0.9], [25, 39, 0.9], [39, 25, 1.0],
  ];
  for (const [x, z, s] of rocks) {
    if (!nearLane(x, z, 2.0 * s) && !nearReservedZone(x, z)) addRock(scene, colliders, x, z, s);
  }

  const flowers: Array<[number, number, number]> = [
    [-33, -6, 0xf37ccf], [-26, 28, 0x8d7cff], [-12, -30, 0xf3d06c],
    [0, 30, 0x80e7ff], [12, -30, 0x80e7ff], [26, -28, 0x8d7cff],
    [33, 6, 0xf37ccf], [-48, 42, 0x80e7ff], [48, -42, 0xff9b7c],
  ];
  for (const [x, z, color] of flowers) addFlowers(scene, x, z, color);

  scatterFoliage(scene, colliders);
  addCornerMarker(scene, BASE_BLUE_X, BASE_BLUE_Z, 0x4684e6);
  addCornerMarker(scene, BASE_RED_X, BASE_RED_Z, 0xe85656);
}

const RNG_SEED = 0x9e3779b1;
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function scatterFoliage(scene: THREE.Scene, colliders: Colliders): void {
  const rng = makeRng(RNG_SEED);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f8033, roughness: 1 });
  const grassDarkMat = new THREE.MeshStandardMaterial({ color: 0x2d6024, roughness: 1 });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x376a32, roughness: 0.95 });
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 1, flatShading: true });
  const grassGeom = new THREE.ConeGeometry(0.16, 0.45, 4);
  const grassLight = new THREE.InstancedMesh(grassGeom, grassMat, 260);
  const grassDark = new THREE.InstancedMesh(grassGeom, grassDarkMat, 260);
  const tmpMat = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  let lightIdx = 0;
  let darkIdx = 0;

  for (let i = 0; i < 460; i++) {
    const x = (rng() - 0.5) * (MAP_W - 10);
    const z = (rng() - 0.5) * (MAP_H - 10);
    if (nearLane(x, z, 1.2) || nearReservedZone(x, z)) continue;
    const yaw = rng() * Math.PI * 2;
    const s = 0.7 + rng() * 0.8;
    tmpPos.set(x, 0.22, z);
    tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    tmpScale.setScalar(s);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    if (rng() > 0.48) {
      if (darkIdx < grassDark.count) grassDark.setMatrixAt(darkIdx++, tmpMat);
    } else if (lightIdx < grassLight.count) {
      grassLight.setMatrixAt(lightIdx++, tmpMat);
    }
  }
  grassLight.count = lightIdx;
  grassDark.count = darkIdx;
  grassLight.instanceMatrix.needsUpdate = true;
  grassDark.instanceMatrix.needsUpdate = true;
  scene.add(grassLight, grassDark);

  const bushGeom = new THREE.SphereGeometry(0.62, 8, 6);
  for (let i = 0; i < 30; i++) {
    const x = (rng() - 0.5) * (MAP_W - 18);
    const z = (rng() - 0.5) * (MAP_H - 18);
    if (nearLane(x, z, 2.4) || nearReservedZone(x, z)) continue;
    const bush = new THREE.Mesh(bushGeom, bushMat);
    bush.position.set(x, 0.48, z);
    bush.scale.set(1 + rng() * 0.8, 0.85, 1 + rng() * 0.8);
    scene.add(bush);
    colliders.addCircle(x, z, 0.55);
  }

  const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.18, 0), pebbleMat, 120);
  let pebIdx = 0;
  for (let i = 0; i < 150; i++) {
    const x = (rng() - 0.5) * (MAP_W - 12);
    const z = (rng() - 0.5) * (MAP_H - 12);
    if (nearLane(x, z, 0.8) || nearReservedZone(x, z)) continue;
    tmpQuat.setFromEuler(new THREE.Euler(rng(), rng() * Math.PI * 2, rng()));
    tmpScale.setScalar(0.7 + rng() * 0.9);
    tmpPos.set(x, 0.12, z);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    if (pebIdx < pebbles.count) pebbles.setMatrixAt(pebIdx++, tmpMat);
  }
  pebbles.count = pebIdx;
  pebbles.instanceMatrix.needsUpdate = true;
  scene.add(pebbles);
}

function distanceToLane(x: number, z: number): number {
  let best = Infinity;
  for (const pts of LANE_POLYLINES) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      best = Math.min(best, distanceToSegment(x, z, ax, az, bx, bz));
    }
  }
  return best;
}

function nearLane(x: number, z: number, extraClearance = 0): boolean {
  return distanceToLane(x, z) < LANE_WIDTH / 2 + extraClearance;
}

function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 0.0001) return Math.hypot(x - ax, z - az);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function nearReservedZone(x: number, z: number): boolean {
  const d = (cx: number, cz: number) => Math.hypot(x - cx, z - cz);
  if (d(BASE_BLUE_X, BASE_BLUE_Z) < 15) return true;
  if (d(BASE_RED_X, BASE_RED_Z) < 15) return true;
  if (d(SPAWN_BLUE_X, SPAWN_BLUE_Z) < 9) return true;
  if (d(SPAWN_RED_X, SPAWN_RED_Z) < 9) return true;
  for (const [tx, tz] of TOWER_POINTS) {
    if (d(tx, tz) < 7) return true;
  }
  return false;
}

function addTree(scene: THREE.Scene, colliders: Colliders, x: number, z: number, scale: number): void {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25 * scale, 0.32 * scale, 1.6 * scale, 8),
    new THREE.MeshStandardMaterial({ color: COLOR_TREE_TRUNK, roughness: 0.9 }),
  );
  trunk.position.set(x, 0.8 * scale, z);
  trunk.castShadow = true;
  scene.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.2 * scale, 2.4 * scale, 10),
    new THREE.MeshStandardMaterial({ color: COLOR_TREE_LEAVES, roughness: 0.85 }),
  );
  leaves.position.set(x, 2.8 * scale, z);
  leaves.castShadow = true;
  scene.add(leaves);
  colliders.addCircle(x, z, 0.48 * scale);
}

function addRock(scene: THREE.Scene, colliders: Colliders, x: number, z: number, scale: number): void {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.9 * scale, 0),
    new THREE.MeshStandardMaterial({ color: COLOR_ROCK, roughness: 1, flatShading: true }),
  );
  rock.position.set(x, 0.7 * scale, z);
  rock.rotation.set((x % 5) * 0.04, (x + z) * 0.08, (z % 5) * 0.04);
  rock.castShadow = true;
  scene.add(rock);
  colliders.addCircle(x, z, 0.68 * scale);
}

function addFlowers(scene: THREE.Scene, cx: number, cz: number, color = COLOR_FLOWER): void {
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 0.55 + ((i * 37) % 10) * 0.07;
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.18, 6), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx + Math.cos(a) * r, 0.066, cz + Math.sin(a) * r);
    scene.add(m);
  }
}

function addCornerMarker(scene: THREE.Scene, cx: number, cz: number, color: number): void {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(8, 8.6, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, 0.072, cz);
  scene.add(ring);
}
