import { useEffect, useState } from "react";

export type MotionPreference = "full" | "reduced";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const LOW_END_CORES = 4;
const LOW_END_MEMORY_GB = 4;

/** Returns "full" or "reduced". Respects the OS reduced-motion preference,
   a low-end device heuristic (CPU cores <= 4 or device memory <= 4 GB when
   available), and an explicit `data-motion="reduced"|"off"` attribute on
   <html>. Animations must never block navigation or input. */
export function useMotionPreference(): MotionPreference {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return true;
    if (document.documentElement.dataset.motion === "reduced" || document.documentElement.dataset.motion === "off") return true;
    if (typeof window.matchMedia === "function" && window.matchMedia(REDUCED_QUERY).matches) return true;
    if (typeof navigator !== "undefined" && "hardwareConcurrency" in navigator) {
      const cores = (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency;
      if (typeof cores === "number" && cores > 0 && cores <= LOW_END_CORES) return true;
    }
    if (typeof navigator !== "undefined" && "deviceMemory" in navigator) {
      const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      if (typeof mem === "number" && mem > 0 && mem <= LOW_END_MEMORY_GB) return true;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(REDUCED_QUERY);
    const handler = () => setReduced(media.matches);
    media.addEventListener?.("change", handler);
    return () => media.removeEventListener?.("change", handler);
  }, []);

  useEffect(() => {
    const attr = document.documentElement.dataset.motion;
    if (attr === "reduced" || attr === "off") setReduced(true);
  }, []);

  return reduced ? "reduced" : "full";
}
