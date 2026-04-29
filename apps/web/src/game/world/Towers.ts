import * as THREE from 'three';
import {
  HALF,
  TOWER_RADIUS,
  TOWER_HEIGHT,
  COLOR_TOWER_BLUE,
  COLOR_TOWER_RED,
} from '../constants.js';
import type { Colliders } from './Colliders.js';

/**
 * 3 towers per lane per side. Blue base bottom-left of screen
 * (world: -X, +Z), red base top-right (world: +X, -Z).
 */
export function buildTowers(scene: THREE.Scene, colliders: Colliders): void {
  const blueMat = new THREE.MeshStandardMaterial({ color: COLOR_TOWER_BLUE, roughness: 0.5 });
  const redMat = new THREE.MeshStandardMaterial({ color: COLOR_TOWER_RED, roughness: 0.5 });

  // Mid lane along the diagonal (-X,+Z) → (+X,-Z)
  const midOffsets = [-22, -10, 10, 22];
  for (let i = 0; i < midOffsets.length; i++) {
    const t = midOffsets[i];
    const x = t / Math.SQRT2;
    const z = -t / Math.SQRT2;
    placeTower(scene, x, z, i < 2 ? blueMat : redMat, colliders);
  }

  // Top lane: blue side at x = -HALF+8 with high +Z, red side at z = -HALF+8
  for (const z of [HALF - 22, HALF - 36]) placeTower(scene, -HALF + 8, z, blueMat, colliders);
  for (const x of [HALF - 36, HALF - 22]) placeTower(scene, x, -HALF + 8, redMat, colliders);

  // Bot lane: blue side at z = HALF-8, red side at x = HALF-8
  for (const x of [-HALF + 22, -HALF + 36]) placeTower(scene, x, HALF - 8, blueMat, colliders);
  for (const z of [-HALF + 36, -HALF + 22]) placeTower(scene, HALF - 8, z, redMat, colliders);
}

function placeTower(
  scene: THREE.Scene,
  x: number,
  z: number,
  mat: THREE.Material,
  colliders: Colliders,
): void {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(TOWER_RADIUS * 1.4, TOWER_RADIUS * 1.6, 1, 16),
    mat,
  );
  base.position.set(x, 0.5, z);
  scene.add(base);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS * 1.2, TOWER_HEIGHT, 16),
    mat,
  );
  shaft.position.set(x, 1 + TOWER_HEIGHT / 2, z);
  scene.add(shaft);

  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(TOWER_RADIUS * 1.3, 1.6, 16),
    mat,
  );
  cap.position.set(x, 1 + TOWER_HEIGHT + 0.8, z);
  scene.add(cap);

  colliders.addCircle(x, z, TOWER_RADIUS * 1.6);
}
