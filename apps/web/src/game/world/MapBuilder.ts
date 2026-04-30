import * as THREE from 'three';
import {
  MAP_W,
  MAP_H,
  HALF_W,
  HALF_H,
  LANE_WIDTH,
  LANE_LENGTH,
  LANE_ANGLE_RAD,
  COLOR_GROUND,
  COLOR_LANE,
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
} from '../constants.js';
import { buildBases, Base } from './Bases.js';
import { buildTowers, Tower } from './Towers.js';
import { Colliders } from './Colliders.js';

export interface MapEntities {
  colliders: Colliders;
  towers: Tower[];
  bases: Base[];
}

/**
 * Diagonal-lane MVP arena: square ground, blue base in the (+x,+z) corner,
 * red base in the (-x,-z) corner, one tower per side along the diagonal.
 * Trees, rocks and flower clusters fill the off-lane area so movement reads.
 *
 * Returned arrays are ordered [blue, red].
 */
export function buildMap(scene: THREE.Scene): MapEntities {
  const colliders = new Colliders();
  buildGround(scene);
  buildLane(scene);
  buildPerimeterWalls(scene, colliders);
  buildSpawnZones(scene);
  const bases = buildBases(scene, colliders);
  const towers = buildTowers(scene, colliders);
  buildLandmarks(scene, colliders);
  return { colliders, towers, bases };
}

function buildGround(scene: THREE.Scene): void {
  const geom = new THREE.PlaneGeometry(MAP_W, MAP_H, 12, 12);
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_GROUND, roughness: 1 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Subtle grid stripes — give the eye landmarks even on flat ground.
  for (let i = -HALF_W + 20; i <= HALF_W - 20; i += 20) {
    addStripe(scene, i, 0, 0.4, MAP_H - 4, 0x5a8c40);
    addStripe(scene, 0, i, MAP_W - 4, 0.4, 0x5a8c40);
  }
}

function addStripe(
  scene: THREE.Scene,
  cx: number,
  cz: number,
  w: number,
  h: number,
  color: number,
): void {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, 0.015, cz);
  scene.add(m);
}

function buildLane(scene: THREE.Scene): void {
  const geom = new THREE.PlaneGeometry(LANE_LENGTH, LANE_WIDTH);
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_LANE, roughness: 0.9 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  // Rotate the long axis onto the (+x,+z) ↔ (-x,-z) diagonal.
  mesh.rotation.z = LANE_ANGLE_RAD;
  mesh.position.y = 0.02;
  scene.add(mesh);

  // Tile markers along the lane every ~10 units — moving feels like progress.
  const step = 10;
  const half = LANE_LENGTH / 2 - 6;
  const dirX = Math.cos(LANE_ANGLE_RAD);
  const dirZ = -Math.sin(LANE_ANGLE_RAD);
  for (let s = -half; s <= half; s += step) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0x8a5a25,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = LANE_ANGLE_RAD + Math.PI / 2;
    m.position.set(dirX * s, 0.03, dirZ * s);
    scene.add(m);
  }
}

function buildPerimeterWalls(scene: THREE.Scene, colliders: Colliders): void {
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_WALL, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xb6a083, roughness: 0.85 });
  const wallH = 3.2;
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
      const post = new THREE.Mesh(new THREE.BoxGeometry(4.4, wallH + 1, 4.4), postMat);
      post.position.set(x, (wallH + 1) / 2, z);
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
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(cx, 0.045, cz);
  scene.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SPAWN_ZONE_RADIUS - 0.45, SPAWN_ZONE_RADIUS, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, 0.055, cz);
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
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (let i = 0; i < 3; i++) {
    const step = 1.8 + i * 1.5;
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = angle + Math.PI / 2;
    arrow.position.set(cx + nx * step, 0.065, cz + nz * step);
    scene.add(arrow);
  }
}

function buildLandmarks(scene: THREE.Scene, colliders: Colliders): void {
  // Hand-picked placements off the diagonal lane so the eye has reference
  // points while moving. Each entry is a function on (scene, colliders).
  // Lane runs along the (+x,−z) ↔ (−x,+z) anti-diagonal. Landmark coordinates
  // are mirrored across the X axis so they stay off-lane (they were originally
  // tuned for the (+x,+z) diagonal).
  const trees: Array<[number, number, number]> = [
    [-44, -30, 1.0],
    [-30, -44, 1.2],
    [-12, -36, 0.9],
    [-36, -12, 1.1],
    [12, 36, 0.9],
    [30, 44, 1.2],
    [44, 30, 1.0],
    [36, 12, 1.1],
    [50, 0, 1.3],
    [-50, 0, 1.3],
    [0, 50, 1.3],
    [0, -50, 1.3],
    [-20, 42, 1.0],
    [20, -42, 1.0],
    [42, -20, 1.0],
    [-42, 20, 1.0],
  ];
  for (const [x, z, s] of trees) addTree(scene, colliders, x, z, s);

  const rocks: Array<[number, number, number]> = [
    [-18, -24, 1.4],
    [24, 18, 1.4],
    [-40, 8, 1.0],
    [40, -8, 1.0],
    [-8, -40, 1.0],
    [8, 40, 1.0],
    [0, 30, 1.1],
    [0, -30, 1.1],
    [30, 0, 1.1],
    [-30, 0, 1.1],
  ];
  for (const [x, z, s] of rocks) addRock(scene, colliders, x, z, s);

  // Decorative flower clusters (no collision) — pure visual reference.
  const flowers: Array<[number, number]> = [
    [-22, -38],
    [22, 38],
    [-38, -22],
    [38, 22],
    [-15, -15],
    [15, 15],
    [-50, 50],
    [50, -50],
  ];
  for (const [x, z] of flowers) addFlowers(scene, x, z);

  // Highlight rings around each base so the destination is unmistakable.
  addCornerMarker(scene, BASE_BLUE_X, BASE_BLUE_Z, 0x4684e6);
  addCornerMarker(scene, BASE_RED_X, BASE_RED_Z, 0xe85656);

  // Filler vegetation. Pseudo-random with a deterministic seed so rebuilds
  // place the props in the same spots — important for collider tests later.
  scatterFoliage(scene, colliders);
  buildCampfires(scene);
}

const RNG_SEED = 0x9e3779b1;
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * Scatter small props (grass tufts, bushes, pebbles) across the map but keep
 * a clear corridor along the lane and around bases/towers/spawn pads so the
 * playable lane stays readable.
 *
 * Grass and pebble props use InstancedMesh — one draw call for hundreds of
 * sprites instead of one per sprite. Bushes stay individual because they're
 * few and need colliders.
 */
function scatterFoliage(scene: THREE.Scene, colliders: Colliders): void {
  const rng = makeRng(RNG_SEED);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f8033, roughness: 1 });
  const grassDarkMat = new THREE.MeshStandardMaterial({ color: 0x2d6024, roughness: 1 });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x376a32, roughness: 0.95 });
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 1, flatShading: true });

  // Grass — two instanced meshes (light/dark) for one draw call each.
  const grassGeom = new THREE.ConeGeometry(0.16, 0.45, 4);
  const grassLight = new THREE.InstancedMesh(grassGeom, grassMat, 200);
  const grassDark = new THREE.InstancedMesh(grassGeom, grassDarkMat, 200);
  let lightIdx = 0;
  let darkIdx = 0;
  const tmpMat = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  for (let i = 0; i < 320; i++) {
    const x = (rng() - 0.5) * (MAP_W - 8);
    const z = (rng() - 0.5) * (MAP_H - 8);
    if (distanceToLane(x, z) < LANE_WIDTH * 0.55 + 1.2) continue;
    if (nearReservedZone(x, z)) continue;
    const yaw = rng() * Math.PI * 2;
    const s = 0.7 + rng() * 0.7;
    tmpPos.set(x, 0.22, z);
    tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    tmpScale.setScalar(s);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    const useDark = rng() > 0.5;
    if (useDark && darkIdx < grassDark.count) grassDark.setMatrixAt(darkIdx++, tmpMat);
    else if (!useDark && lightIdx < grassLight.count) grassLight.setMatrixAt(lightIdx++, tmpMat);
  }
  grassLight.count = lightIdx;
  grassDark.count = darkIdx;
  grassLight.instanceMatrix.needsUpdate = true;
  grassDark.instanceMatrix.needsUpdate = true;
  scene.add(grassLight, grassDark);

  // Bushes — kept as individual meshes because each needs a collider.
  const bushGeom = new THREE.SphereGeometry(0.55, 8, 6);
  for (let i = 0; i < 22; i++) {
    const x = (rng() - 0.5) * (MAP_W - 16);
    const z = (rng() - 0.5) * (MAP_H - 16);
    if (distanceToLane(x, z) < LANE_WIDTH * 0.7 + 2) continue;
    if (nearReservedZone(x, z)) continue;
    const bush = new THREE.Mesh(bushGeom, bushMat);
    bush.position.set(x, 0.45, z);
    bush.scale.set(1 + rng() * 0.6, 0.85, 1 + rng() * 0.6);
    scene.add(bush);
    colliders.addCircle(x, z, 0.55);
  }

  // Pebbles — purely decorative, perfect for instancing.
  const pebbleGeom = new THREE.DodecahedronGeometry(0.18, 0);
  const pebbles = new THREE.InstancedMesh(pebbleGeom, pebbleMat, 90);
  let pebIdx = 0;
  for (let i = 0; i < 90; i++) {
    const x = (rng() - 0.5) * (MAP_W - 8);
    const z = (rng() - 0.5) * (MAP_H - 8);
    if (nearReservedZone(x, z)) continue;
    const euler = new THREE.Euler(rng(), rng() * Math.PI * 2, rng());
    tmpQuat.setFromEuler(euler);
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
  // Lane runs along (+x,−z) ↔ (−x,+z); perpendicular distance is |x + z|/√2.
  return Math.abs(x + z) / Math.SQRT2;
}

function nearReservedZone(x: number, z: number): boolean {
  // Don't crowd bases, spawn pads, or towers.
  const dBase = (cx: number, cz: number) => Math.hypot(x - cx, z - cz);
  if (dBase(BASE_BLUE_X, BASE_BLUE_Z) < 14) return true;
  if (dBase(BASE_RED_X, BASE_RED_Z) < 14) return true;
  if (dBase(SPAWN_BLUE_X, SPAWN_BLUE_Z) < 8) return true;
  if (dBase(SPAWN_RED_X, SPAWN_RED_Z) < 8) return true;
  if (dBase(-22, 22) < 6) return true; // tower blue
  if (dBase(22, -22) < 6) return true; // tower red
  return false;
}

/** Two campfires — small ambient landmark on the off-lane sides. */
function buildCampfires(scene: THREE.Scene): void {
  const spots: Array<[number, number]> = [
    [-26, -26],
    [26, 26],
  ];
  for (const [x, z] of spots) {
    const stones = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.28, 0),
        new THREE.MeshStandardMaterial({ color: 0x6f6862, roughness: 1, flatShading: true }),
      );
      stone.position.set(Math.cos(a) * 0.7, 0.16, Math.sin(a) * 0.7);
      stone.rotation.set(Math.random(), Math.random() * Math.PI * 2, Math.random());
      stones.add(stone);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.7, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff9a3c,
        emissive: 0xff5a18,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9,
      }),
    );
    flame.position.y = 0.55;
    stones.add(flame);
    stones.position.set(x, 0, z);
    scene.add(stones);
  }
}

function addTree(
  scene: THREE.Scene,
  colliders: Colliders,
  x: number,
  z: number,
  scale: number,
): void {
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
  leaves.position.set(x, 1.6 * scale + 1.2 * scale, z);
  leaves.castShadow = true;
  scene.add(leaves);

  colliders.addCircle(x, z, 0.5 * scale);
}

function addRock(
  scene: THREE.Scene,
  colliders: Colliders,
  x: number,
  z: number,
  scale: number,
): void {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.9 * scale, 0),
    new THREE.MeshStandardMaterial({ color: COLOR_ROCK, roughness: 1, flatShading: true }),
  );
  rock.position.set(x, 0.7 * scale, z);
  rock.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
  rock.castShadow = true;
  scene.add(rock);
  colliders.addCircle(x, z, 0.7 * scale);
}

function addFlowers(scene: THREE.Scene, cx: number, cz: number): void {
  const mat = new THREE.MeshBasicMaterial({ color: COLOR_FLOWER });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 0.6 + Math.random() * 0.7;
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.18, 6), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx + Math.cos(a) * r, 0.03, cz + Math.sin(a) * r);
    scene.add(m);
  }
}

function addCornerMarker(scene: THREE.Scene, cx: number, cz: number, color: number): void {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(8, 8.5, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, 0.05, cz);
  scene.add(ring);
}
