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

## Original brand assets — Phase 4 Part 2

Aster is ArcTester’s original study-owl mascot, authored for this project and not based on third-party app mascots or character assets.

- Web hero illustration: `/web/public/brand/aster-mascot.svg`
- Compact web mark: `/web/public/brand/aster-mark.svg`
- Web wrapper: `web/src/components/ArcTesterMascot.tsx`
- Mobile-native vector counterpart: `mobile/src/components/ArcTesterMascot.tsx`

Use the shared web component instead of hardcoding initials or asset URLs. Give meaningful artwork an accessible name; mark decorative instances as decorative. Keep the mascot out of dense administration screens. Animation, sound, and haptics belong to later Phase 4 slices.

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


## Gallery — Phase 4 Part 4

- Open the live Vite-served preview at `/design-system-gallery.html`.
- The gallery is intentionally static and does not call the API or modify user state.
- Use its theme and reduced-motion controls to review component states; its sample progress button only changes local demo state.
- Playwright coverage lives in `web/tests/e2e/design-system-gallery.spec.ts`.
