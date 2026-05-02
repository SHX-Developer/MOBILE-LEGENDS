import * as THREE from 'three';
import {
  MAP_W,
  MAP_H,
  HALF_W,
  HALF_H,
  LANE_WIDTH,
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
  TOWER_BLUE_TOP_X,
  TOWER_BLUE_TOP_Z,
  TOWER_BLUE_MID_X,
  TOWER_BLUE_MID_Z,
  TOWER_BLUE_BOT_X,
  TOWER_BLUE_BOT_Z,
  TOWER_RED_TOP_X,
  TOWER_RED_TOP_Z,
  TOWER_RED_MID_X,
  TOWER_RED_MID_Z,
  TOWER_RED_BOT_X,
  TOWER_RED_BOT_Z,
  LANE_PATHS,
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
  buildRiver(scene);
  buildPerimeterWalls(scene, colliders);
  buildSpawnZones(scene);
  const bases = buildBases(scene, colliders);
  const towers = buildTowers(scene, colliders);
  buildJungleBarriers(scene, colliders);
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

/**
 * Build all three lanes (top / mid / bot). Each lane is drawn as a series
 * of straight rectangles between waypoints, with a circular cap at every
 * bend so the corners look smooth instead of mitred. Mid is a straight
 * diagonal; top hugs the (-x, ...) wall before bending right; bot hugs
 * the (..., +z) wall before bending up.
 */
function buildLane(scene: THREE.Scene): void {
  const laneMat = new THREE.MeshStandardMaterial({ color: COLOR_LANE, roughness: 0.9 });
  const startPt: readonly [number, number] = [BASE_BLUE_X, BASE_BLUE_Z];
  const endPt: readonly [number, number] = [BASE_RED_X, BASE_RED_Z];
  drawLanePolyline(scene, laneMat, [startPt, ...LANE_PATHS.top.blue, endPt]);
  drawLanePolyline(scene, laneMat, [startPt, ...LANE_PATHS.mid.blue, endPt]);
  drawLanePolyline(scene, laneMat, [startPt, ...LANE_PATHS.bot.blue, endPt]);
}

function drawLanePolyline(
  scene: THREE.Scene,
  mat: THREE.Material,
  pts: ReadonlyArray<readonly [number, number]>,
): void {
  const half = LANE_WIDTH / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const segment = new THREE.Mesh(new THREE.PlaneGeometry(len + LANE_WIDTH * 0.4, LANE_WIDTH), mat);
    segment.rotation.x = -Math.PI / 2;
    // Rotate the segment so its +X aligns with (dx, dz). atan2(dz, dx) for
    // ground-plane yaw, but the plane's normal points up so we negate.
    segment.rotation.z = -Math.atan2(dz, dx);
    segment.position.set((ax + bx) / 2, 0.02, (az + bz) / 2);
    scene.add(segment);
    // Disc cap at every joint so bends merge cleanly.
    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(half, 28),
      mat,
    );
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(ax, 0.022, az);
    scene.add(cap);
  }
  // Final cap at the last point.
  const last = pts[pts.length - 1];
  const cap = new THREE.Mesh(new THREE.CircleGeometry(LANE_WIDTH / 2, 28), mat);
  cap.rotation.x = -Math.PI / 2;
  cap.position.set(last[0], 0.022, last[1]);
  scene.add(cap);
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
  // Hand-picked placements filtered against all three lane corridors so the
  // eye has reference points without putting rocks or trunks in minion paths.
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
  for (const [x, z, s] of trees) {
    if (!nearLane(x, z, 1.4 * s)) addTree(scene, colliders, x, z, s);
  }

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
  for (const [x, z, s] of rocks) {
    if (!nearLane(x, z, 1.8 * s)) addRock(scene, colliders, x, z, s);
  }

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
const LANE_POLYLINES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[BASE_BLUE_X, BASE_BLUE_Z], ...LANE_PATHS.top.blue, [BASE_RED_X, BASE_RED_Z]],
  [[BASE_BLUE_X, BASE_BLUE_Z], ...LANE_PATHS.mid.blue, [BASE_RED_X, BASE_RED_Z]],
  [[BASE_BLUE_X, BASE_BLUE_Z], ...LANE_PATHS.bot.blue, [BASE_RED_X, BASE_RED_Z]],
];

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * Scatter small props (grass tufts, bushes, pebbles) across the map but keep
 * a clear corridor along every lane and around bases/towers/spawn pads so the
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
    if (nearLane(x, z, 1.2)) continue;
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
    if (nearLane(x, z, 2.2)) continue;
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
    if (nearLane(x, z, 0.8)) continue;
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

function distanceToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 0.0001) return Math.hypot(x - ax, z - az);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function nearReservedZone(x: number, z: number): boolean {
  // Don't crowd bases, spawn pads, or towers.
  const dBase = (cx: number, cz: number) => Math.hypot(x - cx, z - cz);
  if (dBase(BASE_BLUE_X, BASE_BLUE_Z) < 14) return true;
  if (dBase(BASE_RED_X, BASE_RED_Z) < 14) return true;
  if (dBase(SPAWN_BLUE_X, SPAWN_BLUE_Z) < 8) return true;
  if (dBase(SPAWN_RED_X, SPAWN_RED_Z) < 8) return true;
  const towers: ReadonlyArray<readonly [number, number]> = [
    [TOWER_BLUE_TOP_X, TOWER_BLUE_TOP_Z],
    [TOWER_BLUE_MID_X, TOWER_BLUE_MID_Z],
    [TOWER_BLUE_BOT_X, TOWER_BLUE_BOT_Z],
    [TOWER_RED_TOP_X, TOWER_RED_TOP_Z],
    [TOWER_RED_MID_X, TOWER_RED_MID_Z],
    [TOWER_RED_BOT_X, TOWER_RED_BOT_Z],
  ];
  for (const [tx, tz] of towers) {
    if (dBase(tx, tz) < 6.5) return true;
  }
  return false;
}

/**
 * Decorative river — two cyan strips that run perpendicular to the mid lane,
 * meeting at the centre. Visual only, no collider.
 */
function buildRiver(scene: THREE.Scene): void {
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4ec9ff,
    transparent: true,
    opacity: 0.45,
    roughness: 0.25,
    metalness: 0.1,
  });
  const lengths = [
    // Two strips angled along the (+x,+z) ↔ (-x,-z) axis (perpendicular
    // to the mid lane), each spanning roughly half the map and crossing
    // through the centre.
    { cx: -16, cz: -16 },
    { cx: 16, cz: 16 },
  ];
  for (const { cx, cz } of lengths) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(38, 8), waterMat);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = Math.PI / 4; // run along the (+x,+z) diagonal
    strip.position.set(cx, 0.024, cz);
    scene.add(strip);
  }
  // Centre pool where the strips meet.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(7, 36),
    waterMat,
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.026, 0);
  scene.add(pool);
}

/**
 * Stone walls between the lanes — split the off-lane area into jungle
 * pockets that the player can walk around but not through. Each barrier
 * is a low chain of grey blocks with collider circles.
 */
function buildJungleBarriers(scene: THREE.Scene, colliders: Colliders): void {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b6f7a, roughness: 0.95, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8a8e98, roughness: 0.9 });

  // Ruined stone ridges between the lanes. They mirror the Mobile Legends
  // jungle silhouette: small wall chains around the neutral pockets, with
  // clear mouths into every lane.
  buildWallChain(scene, colliders, wallMat, capMat, [
    [-34, -24], [-27, -25], [-20, -25],
  ]);
  buildWallChain(scene, colliders, wallMat, capMat, [
    [-12, -33], [-4, -34], [4, -33],
  ]);
  buildWallChain(scene, colliders, wallMat, capMat, [
    [4, -30], [12, -31], [20, -32],
  ]);
  buildWallChain(scene, colliders, wallMat, capMat, [
    [-32, 4], [-31, 10], [-30, 16],
  ]);

  buildWallChain(scene, colliders, wallMat, capMat, [
    [34, 24], [27, 25], [20, 25],
  ]);
  buildWallChain(scene, colliders, wallMat, capMat, [
    [12, 33], [4, 34], [-4, 33],
  ]);
  buildWallChain(scene, colliders, wallMat, capMat, [
    [-4, 30], [-12, 31], [-20, 32],
  ]);
  buildWallChain(scene, colliders, wallMat, capMat, [
    [32, -4], [31, -10], [30, -16],
  ]);

  // Mountain shelves sit outside the lanes, like the tall rocky borders in
  // the reference map. The mid lane is deliberately left clean.
  buildMountainCluster(scene, colliders, -30, -31, 0xa39988);
  buildMountainCluster(scene, colliders, 30, 31, 0xa39988);
  buildMountainCluster(scene, colliders, -54, -18, 0x8f8a80);
  buildMountainCluster(scene, colliders, 54, 18, 0x8f8a80);
  buildMountainCluster(scene, colliders, 18, -54, 0x8f8a80);
  buildMountainCluster(scene, colliders, -18, 54, 0x8f8a80);
}

function buildWallChain(
  scene: THREE.Scene,
  colliders: Colliders,
  wallMat: THREE.Material,
  capMat: THREE.Material,
  pts: ReadonlyArray<readonly [number, number]>,
): void {
  for (const [x, z] of pts) {
    if (nearLane(x, z, 2.0) || nearReservedZone(x, z)) continue;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.4, 2.2),
      wallMat,
    );
    block.position.set(x, 0.7, z);
    block.castShadow = true;
    scene.add(block);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.18, 2.4),
      capMat,
    );
    cap.position.set(x, 1.5, z);
    scene.add(cap);
    colliders.addCircle(x, z, 1.3);
  }
}

function buildMountainCluster(
  scene: THREE.Scene,
  colliders: Colliders,
  cx: number,
  cz: number,
  color: number,
): void {
  const stoneMat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const peaks: Array<[number, number, number]> = [
    [cx, cz, 3.2],
    [cx + 2.8, cz - 1.5, 2.4],
    [cx - 2.2, cz + 1.8, 2.6],
    [cx + 1.2, cz + 2.6, 1.9],
  ];
  for (const [px, pz, h] of peaks) {
    if (nearLane(px, pz, 2.4) || nearReservedZone(px, pz)) continue;
    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, h, 7),
      stoneMat,
    );
    peak.position.set(px, h / 2, pz);
    peak.rotation.y = Math.random() * Math.PI;
    peak.castShadow = true;
    scene.add(peak);
    colliders.addCircle(px, pz, 1.3);
  }
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
