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
 * Single-lane MVP arena: long horizontal rectangle, blue base on the left
 * (-X), red base on the right (+X), one tower per side between base and
 * centre. No jungle, no river, no minions.
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
  return { colliders, towers, bases };
}

function buildGround(scene: THREE.Scene): void {
  const geom = new THREE.PlaneGeometry(MAP_W, MAP_H);
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_GROUND, roughness: 1 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function buildLane(scene: THREE.Scene): void {
  const geom = new THREE.PlaneGeometry(MAP_W - 16, LANE_WIDTH);
  const mat = new THREE.MeshStandardMaterial({ color: COLOR_LANE, roughness: 0.9 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  scene.add(mesh);
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
