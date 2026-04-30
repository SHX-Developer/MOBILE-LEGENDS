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

  addCircle(x: number, z: number, r: number): CircleCollider {
    const c: CircleCollider = { x, z, r };
    this.circles.push(c);
    return c;
  }

  addRect(x: number, z: number, halfW: number, halfZ: number): RectCollider {
    const r: RectCollider = { x, z, halfW, halfZ };
    this.rects.push(r);
    return r;
  }

  removeCircle(c: CircleCollider): void {
    const i = this.circles.indexOf(c);
    if (i >= 0) this.circles.splice(i, 1);
  }

  removeRect(r: RectCollider): void {
    const i = this.rects.indexOf(r);
    if (i >= 0) this.rects.splice(i, 1);
  }

  collides(pos: { x: number; z: number }, radius: number): boolean {
    for (const c of this.circles) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const minDist = radius + c.r;
      if (dx * dx + dz * dz < minDist * minDist) return true;
    }
    for (const r of this.rects) {
      const dx = pos.x - r.x;
      const dz = pos.z - r.z;
      const cx = clamp(dx, -r.halfW, r.halfW);
      const cz = clamp(dz, -r.halfZ, r.halfZ);
      const ddx = dx - cx;
      const ddz = dz - cz;
      if (ddx * ddx + ddz * ddz < radius * radius) return true;
    }
    return false;
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
