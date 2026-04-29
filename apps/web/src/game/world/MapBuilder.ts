import * as THREE from 'three';
import {
  MAP_SIZE,
  HALF,
  LANE_WIDTH,
  RIVER_WIDTH,
  COLOR_GROUND,
  COLOR_LANE,
  COLOR_RIVER,
  COLOR_BUSH,
} from '../constants.js';
import { buildBases } from './Bases.js';
import { buildTowers } from './Towers.js';
import { Colliders } from './Colliders.js';

/**
 * MOBA-style map. Blue base bottom-left of screen (world: -X, +Z),
 * red base top-right (world: +X, -Z). Mid lane is the diagonal between
 * the bases, river is the perpendicular diagonal. Two jungle quadrants
 * sit in the remaining corners.
 */
export function buildMap(scene: THREE.Scene): Colliders {
  const colliders = new Colliders();
  buildGround(scene, colliders);
  buildLanes(scene);
  buildRiver(scene);
  buildJungleObstacles(scene, colliders);
  buildJungleBushes(scene);
  buildBases(scene, colliders);
  buildTowers(scene, colliders);
  return colliders;
}

function buildGround(scene: THREE.Scene, colliders: Colliders): void {
  const geom = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_GROUND, roughness: 1 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);

  // outer stone wall border — long stone block on each side
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x97826a, roughness: 0.9 });
  const wallH = 2.4;
  const wallT = 2.2;
  const sides: Array<[number, number, number, number]> = [
    // [cx, cz, halfW (along X), halfZ (along Z)]
    [0, -HALF - wallT / 2, HALF + wallT, wallT / 2],
    [0, HALF + wallT / 2, HALF + wallT, wallT / 2],
    [-HALF - wallT / 2, 0, wallT / 2, HALF + wallT],
    [HALF + wallT / 2, 0, wallT / 2, HALF + wallT],
  ];
  for (const [cx, cz, hw, hz] of sides) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, wallH, hz * 2), wallMat);
    w.position.set(cx, wallH / 2, cz);
    scene.add(w);
    colliders.addRect(cx, cz, hw, hz);
  }

  // corner rock pillars
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x6e5e4a, roughness: 1 });
  for (const [x, z] of [
    [-HALF, -HALF],
    [HALF, -HALF],
    [-HALF, HALF],
    [HALF, HALF],
  ] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 4, 6), pillarMat);
    p.position.set(x, 2, z);
    scene.add(p);
    colliders.addCircle(x, z, 2.6);
  }
}

function buildLanes(scene: THREE.Scene): void {
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_LANE, roughness: 0.9 });

  // mid lane: blue (-X,+Z) → red (+X,-Z) diagonal
  const midLen = Math.hypot(MAP_SIZE - 30, MAP_SIZE - 30);
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH, midLen), mat);
  mid.rotation.x = -Math.PI / 2;
  mid.rotation.z = -Math.PI / 4;
  mid.position.y = 0.02;
  scene.add(mid);

  // top lane (top of screen): blue base goes -Z then +X to red
  addLaneSegment(scene, mat, -HALF + 8, 0, LANE_WIDTH, MAP_SIZE - 24);
  addLaneSegment(scene, mat, 0, -HALF + 8, MAP_SIZE - 24, LANE_WIDTH);

  // bot lane (bottom of screen): blue base goes +X then -Z to red
  addLaneSegment(scene, mat, 0, HALF - 8, MAP_SIZE - 24, LANE_WIDTH);
  addLaneSegment(scene, mat, HALF - 8, 0, LANE_WIDTH, MAP_SIZE - 24);
}

function addLaneSegment(
  scene: THREE.Scene,
  mat: THREE.Material,
  cx: number,
  cz: number,
  w: number,
  h: number,
): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, 0.02, cz);
  scene.add(m);
}

function buildRiver(scene: THREE.Scene): void {
  // river runs perpendicular to mid lane (the other diagonal)
  const len = Math.hypot(MAP_SIZE, MAP_SIZE);
  const geom = new THREE.PlaneGeometry(RIVER_WIDTH, len);
  const mat = new THREE.MeshStandardMaterial({
    color: COLOR_RIVER,
    transparent: true,
    opacity: 0.85,
    roughness: 0.3,
    metalness: 0.2,
  });
  const river = new THREE.Mesh(geom, mat);
  river.rotation.x = -Math.PI / 2;
  river.rotation.z = Math.PI / 4;
  river.position.y = 0.03;
  scene.add(river);

  // pits at the two intersections of mid lane and river
  for (const [x, z, c] of [
    [12, -12, 0x6b3aa5], // top-right of screen — Lord pit
    [-12, 12, 0xa56b3a], // bottom-left of screen — Turtle pit
  ] as const) {
    const pit = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.4, 24),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }),
    );
    pit.position.set(x, 0.05, z);
    scene.add(pit);
  }
}

/**
 * Stone walls + rock clusters that separate lanes from the jungle, plus
 * little altar markers for the 4 jungle camps in each jungle quadrant.
 */
function buildJungleObstacles(scene: THREE.Scene, colliders: Colliders): void {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e7e6b, roughness: 0.95 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6055, roughness: 1 });
  const altarMat = new THREE.MeshStandardMaterial({
    color: 0x8a7a5a,
    roughness: 0.7,
    emissive: 0x2a1f10,
    emissiveIntensity: 0.4,
  });

  // Wall segments: [cx, cz, halfW, halfZ]
  // The two jungle quadrants are top-left of screen (-X, -Z) and
  // bottom-right (+X, +Z). Bases sit in the other two corners.
  const walls: Array<[number, number, number, number]> = [
    // ── top-left jungle (between top-vertical lane and mid lane) ──
    [-30, -18, 6, 1.5],
    [-18, -30, 1.5, 6],
    [-22, -8, 1.5, 4],
    [-8, -22, 4, 1.5],
    [-26, -26, 3, 1.5],

    // ── bottom-right jungle (between bot-vertical lane and mid lane) ──
    [30, 18, 6, 1.5],
    [18, 30, 1.5, 6],
    [22, 8, 1.5, 4],
    [8, 22, 4, 1.5],
    [26, 26, 3, 1.5],

    // ── separators between the two main jungles and the top lane ──
    [-22, 32, 1.5, 4], // blue side near top-of-screen path bend
    [22, -32, 1.5, 4], // red side mirror

    // ── separators near base entries ──
    [-32, 22, 4, 1.5], // blue jungle entrance fence
    [32, -22, 4, 1.5], // red jungle entrance fence
  ];

  for (const [cx, cz, hw, hz] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 1.6, hz * 2), stoneMat);
    wall.position.set(cx, 0.8, cz);
    scene.add(wall);
    colliders.addRect(cx, cz, hw, hz);

    // little rocks on top for texture
    const rockCount = Math.max(2, Math.floor(Math.max(hw, hz) * 0.7));
    for (let i = 0; i < rockCount; i++) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.3, 0),
        rockMat,
      );
      const rx = cx + (Math.random() - 0.5) * (hw * 1.6);
      const rz = cz + (Math.random() - 0.5) * (hz * 1.6);
      rock.position.set(rx, 1.7 + Math.random() * 0.3, rz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      scene.add(rock);
    }
  }

  // Standalone rock obstacles (non-rectangular, decorative + collidable)
  const standaloneRocks: Array<[number, number, number]> = [
    [-15, -15, 1.6],
    [15, 15, 1.6],
    [-32, -8, 1.4],
    [-8, -32, 1.4],
    [32, 8, 1.4],
    [8, 32, 1.4],
  ];
  for (const [x, z, r] of standaloneRocks) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(x, r * 0.8, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(rock);
    colliders.addCircle(x, z, r);
  }

  // Jungle camp altar markers (visual only — tiny stone discs on the ground).
  // Each jungle has 4 camps. Coords mirror across origin between the two jungles.
  const camps: Array<[number, number]> = [
    // top-left jungle (red side jungle entry from blue's POV)
    [-25, -14],
    [-14, -25],
    [-35, -28],
    [-28, -35],
    // bottom-right jungle (blue side jungle from red's POV)
    [25, 14],
    [14, 25],
    [35, 28],
    [28, 35],
  ];
  for (const [x, z] of camps) {
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.25, 16), altarMat);
    altar.position.set(x, 0.13, z);
    scene.add(altar);
  }
}

function buildJungleBushes(scene: THREE.Scene): void {
  // Bushes are walkable (no collider) — purely visual jungle decoration.
  const bushMat = new THREE.MeshStandardMaterial({ color: COLOR_BUSH, roughness: 1 });
  const positions: Array<[number, number]> = [
    // top-left jungle
    [-22, -22], [-30, -14], [-14, -30], [-36, -22], [-22, -36],
    // bottom-right jungle
    [22, 22], [30, 14], [14, 30], [36, 22], [22, 36],
    // bushes near river entrances (gank routes)
    [-6, 4], [4, -6], [6, -4], [-4, 6],
    // base-side bushes
    [-38, 28], [-28, 38], [38, -28], [28, -38],
  ];
  for (const [x, z] of positions) {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), bushMat);
    bush.position.set(x, 1.2, z);
    bush.scale.set(1.4, 0.7, 1.4);
    scene.add(bush);
  }
}
