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

/**
 * Mobile Legends-style map.
 *
 * The map is a square viewed top-down but the gameplay axis is rotated 45°,
 * so the diagonal from corner to corner is the "mid lane". Blue base is the
 * SW corner, red base is the NE corner.
 *
 *   NE: red base
 *      ┌──────────────┐
 *      │  top lane   /│
 *      │   ────────/  │
 *      │  jungle  /   │
 *      │   river/     │
 *      │      / mid   │
 *      │     / jungle │
 *      │    /         │
 *      │   /────      │
 *      │  / bot lane  │
 *      └──────────────┘
 *   SW: blue base
 */
export function buildMap(scene: THREE.Scene): void {
  buildGround(scene);
  buildLanes(scene);
  buildRiver(scene);
  buildJungleBushes(scene);
  buildBases(scene);
  buildTowers(scene);
}

function buildGround(scene: THREE.Scene): void {
  const geom = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_GROUND, roughness: 1 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // outer wall border
  const wallGeom = new THREE.BoxGeometry(MAP_SIZE + 4, 1.5, 2);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a2e22 });
  for (const [px, pz, ry] of [
    [0, -HALF - 1, 0],
    [0, HALF + 1, 0],
    [-HALF - 1, 0, Math.PI / 2],
    [HALF + 1, 0, Math.PI / 2],
  ] as const) {
    const w = new THREE.Mesh(wallGeom, wallMat);
    w.position.set(px, 0.75, pz);
    w.rotation.y = ry;
    w.castShadow = true;
    w.receiveShadow = true;
    scene.add(w);
  }
}

function buildLanes(scene: THREE.Scene): void {
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_LANE, roughness: 0.9 });

  // mid lane: diagonal from SW to NE
  const midLen = Math.hypot(MAP_SIZE - 30, MAP_SIZE - 30);
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH, midLen), mat);
  mid.rotation.x = -Math.PI / 2;
  mid.rotation.z = Math.PI / 4;
  mid.position.y = 0.02;
  mid.receiveShadow = true;
  scene.add(mid);

  // top lane: SW corner up, then across to NE corner (L-shape)
  addLaneSegment(scene, mat, -HALF + 8, 0, LANE_WIDTH, MAP_SIZE - 24, 0); // vertical
  addLaneSegment(scene, mat, 0, HALF - 8, MAP_SIZE - 24, LANE_WIDTH, 0); // horizontal top

  // bottom lane: SW across, then up to NE (L-shape, mirrored)
  addLaneSegment(scene, mat, 0, -HALF + 8, MAP_SIZE - 24, LANE_WIDTH, 0); // horizontal bottom
  addLaneSegment(scene, mat, HALF - 8, 0, LANE_WIDTH, MAP_SIZE - 24, 0); // vertical right
}

function addLaneSegment(
  scene: THREE.Scene,
  mat: THREE.Material,
  cx: number,
  cz: number,
  w: number,
  h: number,
  rotY: number,
): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rotY;
  m.position.set(cx, 0.02, cz);
  m.receiveShadow = true;
  scene.add(m);
}

function buildRiver(scene: THREE.Scene): void {
  // river runs perpendicular to mid lane (NW → SE diagonal)
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
  river.rotation.z = -Math.PI / 4;
  river.position.y = 0.03;
  river.receiveShadow = true;
  scene.add(river);

  // Lord pit (top-right of river) and Turtle pit (bottom-left of river)
  for (const [x, z, c] of [
    [12, 12, 0x6b3aa5],
    [-12, -12, 0xa56b3a],
  ] as const) {
    const pit = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.4, 24),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }),
    );
    pit.position.set(x, 0.05, z);
    pit.receiveShadow = true;
    scene.add(pit);
  }
}

function buildJungleBushes(scene: THREE.Scene): void {
  const bushMat = new THREE.MeshStandardMaterial({ color: COLOR_BUSH, roughness: 1 });
  // hand-placed bushes in the 4 jungle quadrants
  const positions: [number, number][] = [
    [-22, 22], [-30, 14], [-14, 30],     // top-left jungle
    [22, 22], [30, 14], [14, 30],         // top-right jungle (red side)
    [-22, -22], [-30, -14], [-14, -30],  // bottom-left jungle (blue side)
    [22, -22], [30, -14], [14, -30],     // bottom-right jungle
  ];
  for (const [x, z] of positions) {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), bushMat);
    bush.position.set(x, 1.2, z);
    bush.scale.set(1.4, 0.7, 1.4);
    bush.castShadow = true;
    bush.receiveShadow = true;
    scene.add(bush);
  }
}
