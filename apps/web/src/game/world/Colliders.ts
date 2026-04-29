export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

export interface RectCollider {
  x: number;
  z: number;
  halfW: number;
  halfZ: number;
}

/**
 * Static collision world. Build it up while spawning meshes, then call
 * resolve(pos, radius) every frame after moving the player to push them
 * out of overlapping shapes.
 */
export class Colliders {
  readonly circles: CircleCollider[] = [];
  readonly rects: RectCollider[] = [];

  addCircle(x: number, z: number, r: number): void {
    this.circles.push({ x, z, r });
  }

  addRect(x: number, z: number, halfW: number, halfZ: number): void {
    this.rects.push({ x, z, halfW, halfZ });
  }

  resolve(pos: { x: number; z: number }, radius: number): void {
    for (const c of this.circles) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const dist = Math.hypot(dx, dz);
      const minDist = radius + c.r;
      if (dist < minDist && dist > 1e-4) {
        const push = (minDist - dist) / dist;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
    for (const r of this.rects) {
      const dx = pos.x - r.x;
      const dz = pos.z - r.z;
      const cx = clamp(dx, -r.halfW, r.halfW);
      const cz = clamp(dz, -r.halfZ, r.halfZ);
      const ddx = dx - cx;
      const ddz = dz - cz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 > 1e-6 && d2 < radius * radius) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += ddx * push;
        pos.z += ddz * push;
      } else if (d2 <= 1e-6) {
        const overlapX = r.halfW - Math.abs(dx);
        const overlapZ = r.halfZ - Math.abs(dz);
        if (overlapX < overlapZ) {
          pos.x = r.x + (dx >= 0 ? 1 : -1) * (r.halfW + radius);
        } else {
          pos.z = r.z + (dz >= 0 ? 1 : -1) * (r.halfZ + radius);
        }
      }
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
