import { useEffect, useState } from "react";
import { useMotionPreference } from "./useMotionPreference";

/** Animates a value from 0 to `target` over `ms` milliseconds using an ease-out
   cubic. Respects reduced motion (jumps straight to the target). */
export function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(0);
  const reduced = useMotionPreference() !== "full";

  useEffect(() => {
    if (reduced) {
      setV(target);
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);

  return v;
}
