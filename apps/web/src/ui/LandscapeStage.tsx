import { useEffect, useState, type ReactNode } from 'react';

const ASPECT = 16 / 9;

interface Frame {
  logicalW: number;
  logicalH: number;
  vpW: number;
  vpH: number;
  rotated: boolean;
}

function computeFrame(fullscreen: boolean): Frame {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const rotated = vpH > vpW;
  if (fullscreen) {
    // Fill the entire viewport; if the device is in portrait we still
    // rotate 90° but the inner box swaps W/H so it covers fully.
    if (rotated) {
      return { logicalW: vpH, logicalH: vpW, vpW, vpH, rotated };
    }
    return { logicalW: vpW, logicalH: vpH, vpW, vpH, rotated };
  }
  if (rotated) {
    const logicalH = Math.min(vpW, vpH / ASPECT);
    const logicalW = ASPECT * logicalH;
    return { logicalW, logicalH, vpW, vpH, rotated };
  }
  const logicalH = Math.min(vpH, vpW / ASPECT);
  const logicalW = ASPECT * logicalH;
  return { logicalW, logicalH, vpW, vpH, rotated };
}

interface LandscapeStageProps {
  children: ReactNode;
  /** When true, the stage fills the entire viewport instead of being
   *  letterboxed into a fixed 16:9 area. Used by the main menu so the
   *  cyber background reaches edge-to-edge with no black bars. */
  fullscreen?: boolean;
}

/**
 * Wraps menu/overlay content so it always renders in landscape,
 * rotating 90° when the device is in portrait — same as GameCanvas.
 *
 * In the default (game) mode the inner box is locked to 16:9 with
 * black letterbox bars; in `fullscreen` mode (used by the menu) the
 * inner box covers the whole viewport so the cyber background reaches
 * edge-to-edge with no bars.
 */
export function LandscapeStage({ children, fullscreen = false }: LandscapeStageProps) {
  const [frame, setFrame] = useState<Frame>(() => computeFrame(fullscreen));

  useEffect(() => {
    const update = () => setFrame(computeFrame(fullscreen));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [fullscreen]);

  const left = (frame.vpW - frame.logicalW) / 2;
  const top = (frame.vpH - frame.logicalH) / 2;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: fullscreen ? 'transparent' : '#000',
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
