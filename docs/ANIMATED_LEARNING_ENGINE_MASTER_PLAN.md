# ArcTester Animated Learning Engine — Master Plan

**Status:** Planning baseline  
**Target:** AP ECET CSE first; reusable across subjects  
**Production decision:** No LLM or TTS inference in ArcTester production. Lesson authoring and media generation run locally on the creator workstation. Reviewed static lesson packages are published to Cloudflare R2 and loaded by ArcTester.

> This is a plan, not a claim that the engine or listed features already exist. Validate decisions through a vertical-slice prototype and measurements.

## 1. Vision

Build a reusable, data-driven educational runtime combining:
- YouTube-style animated visual explanations.
- Duolingo-style active learning, checkpoints, immediate feedback and progression.
- Natural Telugu-English narration with technical vocabulary preserved.
- Static, versioned content generated once and reviewed before publication.
- Mobile-first playback for budget Android devices and unstable networks.
- A local lesson-production studio that generates, edits, validates, packages and publishes content.

The learner should understand, predict, practice, correct mistakes and recall. Animation quality alone is not the success metric.

## 2. Constraints and non-goals

- No production LLM, TTS, image-generation or video-generation inference service.
- No student-time AI generation; lesson playback is static and deterministic.
- No lesson media binaries in PostgreSQL.
- No bespoke player implementation per topic.
- No mandatory Rust/WASM in the first prototype.
- No unreviewed AI-generated explanations, assets or questions served to students.
- Avoid large prerecorded videos where interactive scene data and reusable visuals work better.
- Do not add another backend/database without a measured need.

## 3. Architecture

### Local authoring workstation
Local model tools (optional), local TTS, image/diagram preparation, scene composition, audio alignment, preview, QA, package build and R2 publishing. Local tools should be interchangeable and usable offline where practical.

### Production
- Existing React + TypeScript web app: lesson player.
- Existing Expo/React Native app: mobile player using the shared lesson schema and platform-specific renderer adapters.
- Existing Express API + PostgreSQL: catalog, access, publication metadata, progress and analytics.
- Cloudflare R2: versioned manifests, scene files, audio, images, animation files and optional downloadable packages.
- Vercel: frontend hosting; Render: API/database hosting.
- CDN caching and immutable versioned object keys.

### Content flow
Syllabus/source material → local lesson draft → human review → scene plan → asset resolution → local TTS/audio processing → timeline alignment → automated validation → device preview → immutable R2 publish → catalog pointer update → student playback → progress events.

### Runtime modules
1. Lesson Catalog
2. Lesson Player
3. Scene Runtime
4. Animation Renderer
5. Audio Runtime
6. Interaction Runtime
7. Asset Resolver and Cache
8. Progress/Mastery Adapter
9. Diagnostics and performance telemetry

## 4. Technology decisions

| Layer | Initial choice | Boundary / future |
|---|---|---|
| Player UI | React + TypeScript | Keep orchestration in TS |
| Mobile | Expo / React Native + TS | Shared schema, native adapters |
| Technical diagrams | SVG + CSS | Canvas only for measured dense scenes |
| Character motion | Rive, after license/runtime spike | Lottie for simple decorative sequences |
| Timeline | Deterministic TypeScript | Rust/WASM only for profiled expensive computations |
| Lesson generation | Local tools on creator laptop | Optional local CLI adapters |
| TTS | Local model/tool on creator laptop | Multiple engines behind one adapter |
| API | Existing Express | No inference microservice |
| Metadata | Existing PostgreSQL/Prisma | Add models only after schema review |
| Media | Cloudflare R2 | Immutable keys, CDN cache |
| Package | JSON manifest + media | Optional offline ZIP |

### Rust decision
Rust is an optional performance and simulation module, not the main renderer. Potential use: graph/tree layout, algorithm tracing, geometry, large deterministic simulations or timeline calculations if profiling proves expensive. First implement and benchmark a TypeScript version. Keep a narrow, versioned WASM interface and a TypeScript fallback. Rust will not automatically accelerate browser SVG/CSS rendering.

## 5. Versioned lesson package

Package contents:
- manifest: lesson identity, schema version, objectives, topic, locale, duration, scene list, asset references and publication version
- scenes: narration, visual composition, actions, checkpoints, transitions and accessibility text
- audio: scene-level narration and optional effects
- captions: timed Telugu, English or mixed-language segments
- assets: images, SVG, Rive/Lottie or reusable asset IDs
- validation report: warnings, checksums and QA status
- authoring source notes: source citations, reviewer notes and evidence; private notes never exposed to students

### Versioning rules
- Published versions are immutable.
- Changed narration regenerates only that scene's audio and alignment.
- Changed visuals do not regenerate audio unless timing/narration changes.
- Assets have stable IDs, version/hash and license/source metadata.
- Catalog points to an explicit published version.
- Rollback changes the catalog pointer; never overwrite old published objects.
- Schema upgrades are explicit and validated.

### Scene contract
Each scene defines scene ID/type, duration, narration/audio, caption segments, visual elements with stable IDs, timed actions, focus/camera target, interactions, transition policy, alt text and reduced-motion alternative.

Scene data describes what should happen; the renderer decides how. Lesson packages must not contain arbitrary executable JavaScript or eval-like scripts.

## 6. Animation engine

### Core primitives
Appear/disappear, move, scale, rotate, compatible shape transform, highlight/focus/dim, draw path/arrow, reveal text/formula, reorder/stack/split/merge, safe camera pan/zoom, wait/cue/transition.

Each action defines start/end state, duration, easing, cancellation, reduced-motion behavior and deterministic seeking.

### Scene templates
- story intro
- concept explanation
- diagram walkthrough
- data structure operation
- algorithm trace
- equation derivation
- step sequence
- comparison
- simulation
- interactive checkpoint
- worked example
- recap
- celebration

Templates reuse one runtime; they are not separate players.

### Synchronization
- Audio is the narration timing authority.
- Use local forced alignment/audio analysis where available; LLM timestamps are estimates, not final.
- Timeline editor supports phrase/word cues and manual adjustment.
- Pause/resume/seek must keep audio and visual clock consistent.
- Handle buffering, background/foreground, audio focus and interruptions.
- Do not animate every word; highlight only meaningful concepts.

### Motion design
Shared easing/duration/spacing/color/type tokens; consistent mascot/character set; educational focus; limited simultaneous motion; readable labels; no flashing or distracting loops. Support pause, replay scene, slow playback, captions, skip and reduced motion.

## 7. Visual asset pipeline

### Asset classes
Original SVG diagrams; reusable technical objects (stack nodes, queue elements, tree nodes, graph edges, memory cells, CPU blocks, number tiles); mascot rigs; backgrounds; icons; reviewed AI-generated analogy art; licensed optional sound effects.

### Asset registry fields
Asset ID/type/name/description; topic tags/search terms; source/creator/license/attribution/acquisition date; content hash/format/dimensions/duration/size; compatible renderer and actions; locale/alt text; version/review/deprecation state; R2 object key.

### Asset selection
Scene planner searches the registry by concept, tags and supported actions. Prefer reuse. If no suitable asset exists, create an explicit asset request for admin review. Never fabricate license data. Use generated imagery for illustrative stories, not exact technical diagrams. Precise diagrams should be structured SVG/scene elements and verified.

## 8. Voice and Telugu-English localization

### Production steps
1. Write an accurate explanation from syllabus/source.
2. Review code-switching and technical terminology.
3. Split narration into scene-sized chunks.
4. Generate voice locally.
5. Normalize loudness, check clipping and trim silence carefully.
6. Align narration and captions.
7. Preview with animation and human-review.
8. Publish immutable audio assets.

### Language profile
Initial profile: te-en, conversational Telugu as primary language, retaining common English technical terms. English profile can be added immediately; other Indian languages later.

Profile controls script/transliteration policy, glossary, number/formula reading, pronunciation overrides, punctuation/pauses, caption behavior and voice metadata.

### Quality rules
- Natural conversational Telugu, not literal textbook translation.
- Preserve standard terms such as Stack, Queue, Push, Pop, Array, Algorithm, Memory and Time Complexity where natural.
- Separate narration from visible technical labels.
- Support Telugu script mixed with Latin technical words.
- Validate abbreviations, formulas, numbers and code identifiers.
- Keep one consistent narrator for prototype.
- Maintain human-reviewed pronunciation glossary.
- Provide transcript, captions and replay.

### Audio storage
Audio in R2, never PostgreSQL. Prefer scene-level MP3 initially for broad compatibility; evaluate Opus only after device tests. Store duration, codec, sample rate, loudness, narration hash, voice/model/version and locale in metadata. Generate locally; production only serves finalized objects. Example immutable key pattern: lessons/{lessonId}/{version}/audio/{sceneId}-{hash}.mp3.

## 9. Local Lesson Studio

Start as local CLI + browser preview, then evolve to a richer editor.

Features:
- lesson outline/objective editor
- scene list and templates
- narration editor with glossary hints
- asset search, preview and replacement
- timeline and waveform
- visual event inspector
- preview play/pause/seek/speed
- checkpoint/question editor
- caption alignment editor
- validation/source/license checklist
- mobile/tablet/desktop viewport preview
- version comparison
- package export/import
- publish to R2 and authenticated catalog update
- rollback
- storage usage and media report

Local commands should validate, optimize/build, preview, package and publish. Support resumable upload and checksums. Credentials must be provided securely at runtime and never embedded in source or packages.

## 10. Admin and publishing

Admin should support draft import, audio/assets upload, validation status, preview, reviewer notes, approval, publish/unpublish, rollback, locale/version management, source/license review, usage estimates and upload retry.

API responsibilities: authorize, validate manifest and object references, record immutable version, update catalog pointer, provide lesson access metadata and progress. No LLM/TTS/media inference.

R2 responsibilities: static published media, immutable object keys, cache headers/CORS, protected draft uploads. Never expose storage secret keys to web/mobile clients.

## 11. Learning interactions

Reusable types:
- single/multi choice, true/false
- numeric/formula entry
- fill blank, matching, ordering
- drag/drop or tap-to-place
- predict next state
- trace algorithm
- change parameter and observe
- identify misconception/error
- code-output prediction

Each interaction includes objective/concept tag, accessible prompt, answer/explanation, hints, retry policy, feedback animation, event IDs and mastery signal. Reuse existing ArcTester progress/mastery/XP where compatible. Keep learning recommendations transparent and do not claim adaptive ML before it is implemented and evaluated.

## 12. Accessibility, performance and offline

### Accessibility
Captions/transcript; keyboard and screen-reader semantics; touch targets; contrast; reduced motion; no information conveyed by color/audio alone; pause/skip/replay; meaningful alt text; static fallback.

### Performance targets (initial, validate on devices)
- First scene starts without downloading the full lesson.
- Lazy-load scenes and preload only next scene.
- Reuse/cache common assets.
- Avoid large videos and duplicate images.
- Aim for 60 FPS on capable devices; gracefully simplify for low-end devices.
- Heavy computations must not block main thread.
- Cap scene object counts and provide fallback renderer.
- Measure startup, asset load, dropped frames, audio drift and memory.

### Offline
Cache manifest and recently used scenes; retry/resume/checksum; optional downloadable lesson package; clear offline status; never publish partial packages; fallback to static diagram/transcript when an asset fails.

## 13. Rust/WASM boundary
Potential modules: graph/tree layout, algorithm trace, geometry/path generation, large simulations. Benchmark TypeScript first. Keep WASM API small/versioned, use serializable inputs/outputs, provide TS fallback, test memory/mobile compatibility and measure artifact size. Do not use Rust for basic UI state or ordinary SVG/CSS transitions.

## 14. Correctness, rights and content safety
- Explicit objectives and syllabus mapping.
- Explanation/worked-example checks against trusted sources.
- AI content remains draft until review.
- Question bank retains existing source and human approval rules.
- Validate formulas/code/diagrams against expected behavior.
- Keep citations and source notes in authoring metadata.
- Do not copy educational channels' artwork, characters, scripts or narration without permission.
- Verify third-party asset licenses and attribution.
- No arbitrary code execution from lesson packages.
- Minimize learner analytics and protect personal data.

## 15. Testing

### Unit
Schema, timeline constraints, action state, seek/pause determinism, asset resolution, glossary checks, answer evaluation, package hash/version.

### Integration
Manifest/scene loading, audio-animation sync, checkpoint pause/resume, asset fallback, publish/rollback, R2 integrity, progress mapping.

### Visual/audio
Golden screenshots; timing regression captures; clipping/silence/loudness checks; Telugu-English pronunciation review; caption alignment; reduced-motion/accessibility.

### Matrix
Low-end and modern Android; web desktop/mobile; slow network; offline after download; app background/foreground; audio interruptions.

## 16. Analytics and learning outcomes
Measure lesson start/completion, scene replay, checkpoint accuracy/retries, hints, audio replay/skip/speed, load failures, sync errors, exit point and concept-level later practice accuracy. Success is improved understanding and later question performance, not watch time alone.

## 17. Roadmap

### Phase 0 — Audit and design
Audit existing lesson draft/static lesson/audio storage/study material/student flows; identify incomplete or overlapping work; finalize schema, asset conventions, R2 contract and renderer/license spike.

### Phase 1 — Vertical slice
Player shell, scene runtime, 3–5 scene types, core primitives, static R2 package, scene audio/captions, one Stack or Queue lesson, one checkpoint, web + Android test.

### Phase 2 — Visual/audio quality
Asset registry, reusable visual kit, local TTS workflow, timing/caption editor, polished motion, reduced motion, glossary and narration review.

### Phase 3 — Interaction runtime
Reusable checkpoint types, prediction/trace, feedback/retry, XP/progress integration, analytics.

### Phase 4 — Local Studio
Editor, preview, validation, package export, local generation adapters, asset request/review, publish/rollback/versioning.

### Phase 5 — Content scale
Templates for data structures, algorithms, math, OS, DBMS, networks and other ECET topics; batch generate/review; reuse assets/glossary; localization.

### Phase 6 — Advanced runtime
Profile real scenes; Canvas where appropriate; Rust/WASM only for measured bottlenecks; offline packages; advanced simulations and concept labs.

### Phase 7 — Adaptive learning
Connect mastery/review/readiness; recommend next lesson from evidence; show rationale; evaluate educational outcomes.

## 18. First prototype definition of done
A Stack or Queue lesson is ready when:
- 5–8 coherent animated scenes
- human-reviewed natural Telugu-English narration
- audio stored in R2 and statically served
- synchronized animation with pause/seek/replay
- captions and reduced-motion support
- at least three functional checkpoints
- useful explanations for wrong answers
- lesson progress recorded
- no production LLM/TTS inference
- package validation, upload and rollback tested
- acceptable low-end Android and slow-network behavior
- pilot learners improve on related practice questions

## 19. Immediate next steps
1. Audit current lesson-related code and unfinished audio storage before implementing new paths.
2. Finalize manifest and scene schema in a separate spec.
3. Compare SVG/CSS and Rive in a small renderer spike; verify licensing.
4. Audition local Telugu-English TTS with a fixed test script and human listening.
5. Build the Stack vertical slice end-to-end.
6. Benchmark before deciding whether Rust/WASM is justified.

**Architecture summary:** local authoring and generation; static immutable lesson packages; R2 media; PostgreSQL metadata/progress; React/TypeScript player; SVG/CSS and Rive/Lottie visuals; optional profiled Rust/WASM; no production LLM/TTS inference.
