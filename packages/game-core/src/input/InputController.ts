export interface InputAxis {
  x: number;
  y: number;
}

export interface InputSource {
  getMovement(): InputAxis;
}

export class CompositeInputController implements InputSource {
  private sources: InputSource[] = [];

  add(source: InputSource): void {
    this.sources.push(source);
  }

  getMovement(): InputAxis {
    let x = 0;
    let y = 0;
    for (const s of this.sources) {
      const v = s.getMovement();
      x += v.x;
      y += v.y;
    }
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
