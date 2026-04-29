import * as THREE from 'three';
import {
  HALF,
  TOWER_RADIUS,
  TOWER_HEIGHT,
  COLOR_TOWER_BLUE,
  COLOR_TOWER_RED,
} from '../constants.js';

/**
 * 3 towers per lane per side. Standard MOBA spacing.
 */
export function buildTowers(scene: THREE.Scene): void {
  const blueMat = new THREE.MeshStandardMaterial({ color: COLOR_TOWER_BLUE, roughness: 0.5 });
  const redMat = new THREE.MeshStandardMaterial({ color: COLOR_TOWER_RED, roughness: 0.5 });

  // Mid lane towers: along the SW→NE diagonal
  const midOffsets = [-22, -10, 10, 22];
  for (let i = 0; i < midOffsets.length; i++) {
    const t = midOffsets[i];
    const x = t / Math.SQRT2;
    const z = t / Math.SQRT2;
    placeTower(scene, x, z, i < 2 ? blueMat : redMat);
  }

  // Top lane: vertical along x = -HALF + 8, then horizontal along z = HALF - 8
  const topVert = [-HALF + 22, -HALF + 36];
  const topHorz = [HALF - 36, HALF - 22];
  for (const z of topVert) placeTower(scene, -HALF + 8, z, blueMat);
  placeTower(scene, -HALF + 8, HALF - 22, redMat); // corner red
  for (const x of topHorz) placeTower(scene, x, HALF - 8, redMat);

  // Bottom lane: horizontal along z = -HALF + 8, then vertical along x = HALF - 8
  const botHorz = [-HALF + 22, -HALF + 36];
  const botVert = [HALF - 36, HALF - 22];
  for (const x of botHorz) placeTower(scene, x, -HALF + 8, blueMat);
  placeTower(scene, HALF - 22, -HALF + 8, redMat); // corner red
  for (const z of botVert) placeTower(scene, HALF - 8, z, redMat);
}

function placeTower(scene: THREE.Scene, x: number, z: number, mat: THREE.Material): void {
  // base
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(TOWER_RADIUS * 1.4, TOWER_RADIUS * 1.6, 1, 16),
    mat,
  );
  base.position.set(x, 0.5, z);
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);

  // shaft
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS * 1.2, TOWER_HEIGHT, 16),
    mat,
  );
  shaft.position.set(x, 1 + TOWER_HEIGHT / 2, z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  scene.add(shaft);

  // cap
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(TOWER_RADIUS * 1.3, 1.6, 16),
    mat,
  );
  cap.position.set(x, 1 + TOWER_HEIGHT + 0.8, z);
  cap.castShadow = true;
  scene.add(cap);
}
