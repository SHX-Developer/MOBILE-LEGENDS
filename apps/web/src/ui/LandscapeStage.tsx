import { useEffect, useState, type ReactNode } from 'react';

const ASPECT = 16 / 9;

interface Frame {
  logicalW: number;
  logicalH: number;
  vpW: number;
  vpH: number;
  rotated: boolean;
}

function computeFrame(): Frame {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const rotated = vpH > vpW;
  if (rotated) {
    const logicalH = Math.min(vpW, vpH / ASPECT);
    const logicalW = ASPECT * logicalH;
    return { logicalW, logicalH, vpW, vpH, rotated };
  }
  const logicalH = Math.min(vpH, vpW / ASPECT);
  const logicalW = ASPECT * logicalH;
  return { logicalW, logicalH, vpW, vpH, rotated };
}

/**
 * Wraps menu/overlay content so it always renders in 16:9 landscape,
 * rotating 90° when the device is in portrait — same as GameCanvas.
 */
export function LandscapeStage({ children }: { children: ReactNode }) {
  const [frame, setFrame] = useState<Frame>(() => computeFrame());

  useEffect(() => {
    const update = () => setFrame(computeFrame());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const left = (frame.vpW - frame.logicalW) / 2;
  const top = (frame.vpH - frame.logicalH) / 2;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: frame.logicalW,
          height: frame.logicalH,
          transform: frame.rotated ? 'rotate(90deg)' : undefined,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
