import * as THREE from 'three';
import { HALF, COLOR_BASE_BLUE, COLOR_BASE_RED } from '../constants.js';

export function buildBases(scene: THREE.Scene): void {
  buildBase(scene, -HALF + 8, -HALF + 8, COLOR_BASE_BLUE);
  buildBase(scene, HALF - 8, HALF - 8, COLOR_BASE_RED);
}

function buildBase(scene: THREE.Scene, x: number, z: number, color: number): void {
  // platform
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 0.6, 32),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  platform.position.set(x, 0.3, z);
  platform.receiveShadow = true;
  scene.add(platform);

  // crystal / nexus
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.2, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.7,
    }),
  );
  crystal.position.set(x, 3.5, z);
  crystal.castShadow = true;
  scene.add(crystal);

  // slowly rotate the crystal
  scene.userData.crystals = scene.userData.crystals ?? [];
  (scene.userData.crystals as THREE.Mesh[]).push(crystal);

  // two guard towers flanking the crystal
  const tMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  for (const [dx, dz] of [
    [3.5, 0],
    [0, 3.5],
  ]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 5, 16), tMat);
    t.position.set(x + dx, 2.5, z + dz);
    t.castShadow = true;
    t.receiveShadow = true;
    scene.add(t);
  }
}
