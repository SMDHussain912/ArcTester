// Monotonic clock for offline exam timing.
//
// React Native does not expose a guaranteed-monotonic timer (there is no
// performance.now() equivalent in core). Date.now() is wall-clock time and can
// jump backward when the device clock is corrected (NTP sync, manual change,
// timezone change). For an offline exam timer we must never let the remaining
// time go backward, otherwise a student could gain time by having their clock
// adjusted.
//
// monotonicNow() returns Date.now() but clamps it so it never decreases within
// the lifetime of the process. A fresh baseline is captured when an offline
// attempt starts so elapsed time is measured relative to that stable point.

let lastValue = 0;

export function monotonicNow(): number {
  const now = Date.now();
  if (now < lastValue) return lastValue;
  lastValue = now;
  return now;
}

export function wallNow(): number {
  return Date.now();
}
