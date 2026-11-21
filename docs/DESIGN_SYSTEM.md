# ArcTester Design System — Foundation

Phase 4 Part 1 establishes the visual and interaction contract before the original mascot, illustration gallery, and sound/haptics assets are introduced.

## Source of truth

- `/design-tokens.json` is the cross-platform token source.
- `web/src/design-system.css` maps tokens to CSS custom properties and legacy web aliases.
- `mobile/src/design/tokens.ts` exposes the same JSON tokens to React Native.

When changing a value, update the source JSON and both platform mappings in the same change. Do not introduce one-off colors, spacing, radius, or motion values for new shared UI without a documented exception.

## Visual principles

- Clear, friendly, focused study interface; readable at small Android sizes.
- Blue is the action color; semantic colors communicate status, never decoration alone.
- Surfaces use restrained borders and shadows. Keep content density comfortable.
- Use the spacing and radius scales rather than arbitrary values.
- Original ArcTester branding only. Do not use Duolingo's mascot, illustrations, sound, or copied assets.

## Component contract

Web primitives live in `web/src/components/ui.tsx` and are styled by `design-system.css`:

- `Button`: primary, secondary, ghost, and danger; small/medium/large; full-width; disabled and loading states.
- `Card`: surface container with a controlled padding scale.
- `Badge`: neutral, info, success, warning, and danger states.
- `ProgressBar`: clamped determinate progress with an accessible label.

Prefer these for new shared UI. Existing screens are migrated incrementally to avoid broad visual regressions during this foundation phase.

## Accessibility and motion

- Keyboard focus uses a visible focus ring.
- Controls expose native disabled, busy, and progress semantics.
- Motion uses short durations and must not be essential to understanding.
- `prefers-reduced-motion: reduce` disables nonessential CSS animation and transitions.
- React Native should also honor the user's/system reduced-motion setting when motion is added.

## Verification

Design primitives have focused component tests. The phase PR must pass web/API tests, lint, build, mobile typecheck/tests, and repository CI before merge.
