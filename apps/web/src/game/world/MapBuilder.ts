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
  const wallH = 2.4;
  const wallT = 2.2;
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
