import * as THREE from 'three';
import {
  MAP_W,
  MAP_H,
  MAP_SCALE,
  HALF_W,
  HALF_H,
  LANE_WIDTH,
  BASE_BLUE_X,
  BASE_BLUE_Z,
  BASE_RED_X,
  BASE_RED_Z,
  SPAWN_BLUE_X,
  SPAWN_BLUE_Z,
  SPAWN_RED_X,
  SPAWN_RED_Z,
  SPAWN_ZONE_RADIUS,
  LANE_PATHS,
} from '../constants.js';
import { buildBases, Base } from './Bases.js';
import { buildTowers, Tower } from './Towers.js';
import { Colliders } from './Colliders.js';

type Point = readonly [number, number];
const S = (value: number) => value * MAP_SCALE;

export interface MapEntities {
  colliders: Colliders;
  towers: Tower[];
  bases: Base[];
}

/** Where the jungle creeps live. World-space spawn points consumed by
 *  Game.ts to instantiate JungleCreep entities. */
export interface JungleCampSpec {
  x: number;
  z: number;
  color: number;
  scale: number;
}
export const JUNGLE_CAMPS: JungleCampSpec[] = [
  { x: S(-32), z: S(-18), color: 0x6bd1ff, scale: 1.2 },
  { x: S(-18), z: S(-36), color: 0x9b7dff, scale: 1.1 },
  { x: S(-30), z: S(20), color: 0x7ee06f, scale: 0.95 },
  { x: S(-12), z: S(32), color: 0xff8a4c, scale: 1.0 },
  { x: S(-8), z: S(-8), color: 0xffb84d, scale: 1.0 },
  { x: S(10), z: S(10), color: 0x9b7dff, scale: 1.0 },
  { x: S(32), z: S(18), color: 0x6bd1ff, scale: 1.2 },
  { x: S(18), z: S(36), color: 0x9b7dff, scale: 1.1 },
  { x: S(30), z: S(-20), color: 0x7ee06f, scale: 0.95 },
  { x: S(12), z: S(-32), color: 0xff8a4c, scale: 1.0 },
  { x: S(-36), z: S(2), color: 0x61d7a4, scale: 0.9 },
  { x: S(36), z: S(-2), color: 0x61d7a4, scale: 0.9 },
];

/**
 * Map builder — deliberately minimal. The previous version had baked-in
 * gradients, banners, rune circles, mountains, etc. and was too noisy to
 * read at the tactical zoom. We now go for "MOBA-icon clean":
 *   • flat green ground
 *   • wide grey lane stripes (top / mid / bot connecting the bases)
 *   • a curving blue river accent
 *   • coloured base plazas in the corners
 *   • spawn-zone arrows
 *   • sparse darker ground patches for visual texture
 * Colliders run along the perimeter so the player can't walk off the
 * island, but they're invisible — the lane stripes already imply the
 * play area. Towers, bases and jungle creeps (registered separately in
 * Game.ts via JUNGLE_CAMPS) are the only structures with geometry.
 */
export function buildMap(scene: THREE.Scene): MapEntities {
  const colliders = new Colliders();
  buildGround(scene);
  buildLanes(scene);
  buildRiver(scene);
  buildSpawnZones(scene);
  buildPerimeterColliders(colliders);
  const bases = buildBases(scene, colliders);
  const towers = buildTowers(scene, colliders);
  return { colliders, towers, bases };
}

/** Solid green floor + a few darker patches to break up the field. */
function buildGround(scene: THREE.Scene): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W, MAP_H, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x456e44 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  scene.add(ground);

  // Darker green patches sprinkled across the field — pure visual
  // texture, no gameplay meaning. Kept simple so the eye reads them as
  // "terrain" not "objects".
  const patchMat = new THREE.MeshBasicMaterial({
    color: 0x315633,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const patches: Array<[number, number, number]> = [
    // [x, z, radius]
    [S(-32), S(28), 14],
    [S(28), S(-32), 14],
    [S(-22), S(-26), 12],
    [S(22), S(26), 12],
    [S(0), S(-12), 9],
    [S(0), S(12), 9],
    [S(-40), S(-10), 8],
    [S(40), S(10), 8],
  ];
  for (const [x, z, r] of patches) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 18), patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.012, z);
    scene.add(patch);
  }

  // Coloured base plazas in the corners. Two-tone (saturated centre +
  // soft outer ring) reads from across the map.
  addBasePlaza(scene, BASE_BLUE_X, BASE_BLUE_Z, 0x6aa8ff, 0xb6d6ff);
  addBasePlaza(scene, BASE_RED_X, BASE_RED_Z, 0xff6b6b, 0xffb3b3);
}

/** Cream-grey lane stripes connecting both bases through top / mid / bot. */
function buildLanes(scene: THREE.Scene): void {
  const laneMat = new THREE.MeshLambertMaterial({ color: 0xd4cda6 });
  const blueBase: Point = [BASE_BLUE_X, BASE_BLUE_Z];
  const redBase: Point = [BASE_RED_X, BASE_RED_Z];
  const allPaths: Point[][] = [
    [blueBase, ...LANE_PATHS.top.blue, redBase] as Point[],
    [blueBase, ...LANE_PATHS.mid.blue, redBase] as Point[],
    [blueBase, ...LANE_PATHS.bot.blue, redBase] as Point[],
  ];
  for (const path of allPaths) {
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, z1] = path[i];
      const [x2, z2] = path[i + 1];
      addLaneSegment(scene, laneMat, x1, z1, x2, z2);
      addLaneCap(scene, laneMat, x1, z1);
    }
    const last = path[path.length - 1];
    addLaneCap(scene, laneMat, last[0], last[1]);
  }
}

/** Flat slab between two waypoints, oriented along the (dx, dz) vector. */
function addLaneSegment(
  scene: THREE.Scene,
  mat: THREE.Material,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): void {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  // Box length along Z (the geometry's depth). Y rotation aligns Z with
  // the (dx, dz) direction.
  const seg = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.05, len), mat);
  seg.position.set((x1 + x2) / 2, 0.03, (z1 + z2) / 2);
  seg.rotation.y = Math.atan2(dx, dz);
  scene.add(seg);
}

/** Round disc to fill the corner where two lane segments meet. */
function addLaneCap(scene: THREE.Scene, mat: THREE.Material, x: number, z: number): void {
  const cap = new THREE.Mesh(new THREE.CircleGeometry(LANE_WIDTH / 2, 22), mat);
  cap.rotation.x = -Math.PI / 2;
  cap.position.set(x, 0.035, z);
  scene.add(cap);
}

/**
 * Wavy blue river that crosses the diagonal between the two team
 * sides. Approximated by a series of narrow box segments along a sine
 * curve so it reads as a flowing line, not a perfectly straight stripe.
 */
function buildRiver(scene: THREE.Scene): void {
  const riverMat = new THREE.MeshLambertMaterial({
    color: 0x3d7fc4,
    emissive: 0x1c4f80,
    emissiveIntensity: 0.25,
  });
  // The river runs from the (−x, +z) base corner toward the (+x, −z)
  // corner, so it crosses behind the mid lane diagonally.
  const startX = -HALF_W * 0.55;
  const startZ = HALF_H * 0.55;
  const endX = HALF_W * 0.55;
  const endZ = -HALF_H * 0.55;
  const dx = endX - startX;
  const dz = endZ - startZ;
  const len = Math.hypot(dx, dz);
  // Unit perpendicular for the sine wiggle.
  const perpX = -dz / len;
  const perpZ = dx / len;
  const N = 24;
  // Pre-compute the path points so each segment can use the next one.
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const wave = Math.sin(t * Math.PI * 2.4) * 6;
    const px = startX + dx * t + perpX * wave;
    const pz = startZ + dz * t + perpZ * wave;
    pts.push([px, pz]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const segDx = b[0] - a[0];
    const segDz = b[1] - a[1];
    const segLen = Math.hypot(segDx, segDz);
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.04, segLen + 0.4),
      riverMat,
    );
    seg.position.set((a[0] + b[0]) / 2, 0.045, (a[1] + b[1]) / 2);
    seg.rotation.y = Math.atan2(segDx, segDz);
    scene.add(seg);
  }
}

/** Lightweight base markings — a saturated disc and a soft outer ring. */
function addBasePlaza(
  scene: THREE.Scene,
  x: number,
  z: number,
  centerColor: number,
  ringColor: number,
): void {
  const center = new THREE.Mesh(
    new THREE.CircleGeometry(13, 36),
    new THREE.MeshLambertMaterial({ color: centerColor }),
  );
  center.rotation.x = -Math.PI / 2;
  center.position.set(x, 0.018, z);
  scene.add(center);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(13.5, 16, 36),
    new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.024, z);
  scene.add(ring);
}

/** Spawn-zone overlays + a short arrow toward map centre. */
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
    new THREE.CircleGeometry(SPAWN_ZONE_RADIUS, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(cx, 0.062, cz);
  scene.add(pad);
  // Arrow toward the enemy half.
  const dirX = -baseX;
  const dirZ = -baseZ;
  const len = Math.hypot(dirX, dirZ);
  const nx = dirX / len;
  const nz = dirZ / len;
  const angle = Math.atan2(nx, nz);
  const arrowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const step = 1.8 + i * 1.5;
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = angle + Math.PI / 2;
    arrow.position.set(cx + nx * step, 0.072, cz + nz * step);
    scene.add(arrow);
  }
}

/**
 * Invisible perimeter colliders. The previous version drew thick stone
 * walls + caps + corner posts; for the MOBA-icon look we rely on the
 * lane stripes themselves to imply the play area and just keep the
 * collider rectangles so the player doesn't walk off the world.
 */
function buildPerimeterColliders(colliders: Colliders): void {
  const wallT = 3;
  const sides: Array<[number, number, number, number]> = [
    [0, -HALF_H - wallT / 2, HALF_W + wallT, wallT / 2],
    [0, HALF_H + wallT / 2, HALF_W + wallT, wallT / 2],
    [-HALF_W - wallT / 2, 0, wallT / 2, HALF_H + wallT],
    [HALF_W + wallT / 2, 0, wallT / 2, HALF_H + wallT],
  ];
  for (const [cx, cz, hw, hz] of sides) colliders.addRect(cx, cz, hw, hz);
}
