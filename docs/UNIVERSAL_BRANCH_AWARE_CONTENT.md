# Universal ArcTester — Part 2: Branch-aware concept and content library

Part 1 stores a student's academic profile on the account: institution name/code, postal PIN, and diploma branch name/code. Part 2 uses that profile to shape the concept library and gate institution/branch-specific learning content.

## Audience scopes

Published study materials and lesson drafts support these scopes:

- `ALL`: shared content available to every student. This is the default for existing and newly created content unless an admin selects a narrower audience.
- `COLLEGE`: available when the student's institution code or normalized institution name matches the content target.
- `BRANCH`: available when the student's branch code or normalized branch name matches. An optional college target further restricts it to that institution.

Codes and names are matched case-insensitively after Unicode normalization, trimming and whitespace folding. Custom institution and branch entries work through name matching. A missing/legacy profile sees global content only. Unknown audience values fail closed.

## Protected delivery

Audience filtering is applied server-side to:
- published study-material listings;
- direct study-file downloads (not just the list);
- published animated lesson listings and lesson detail;
- lesson narration audio;
- versioned lesson manifests and their scene/asset objects.

A direct URL to another branch's published file or lesson returns not found. Admin listing and review remain available through the admin endpoints.

## Branch concept library

The authenticated `GET /concept-library` endpoint returns curated concepts filtered by the student's branch family, with optional search, subject and bounded result count. Computing-focused concepts are tagged for recognized computer/IT/AI/networking diploma branches; concepts without a branch-family tag remain shared. The web and Android Learn/Concept Library views use the same API.

## Migration and compatibility

PostgreSQL and SQLite migrations add audience metadata with `ALL` defaults. Existing published resources therefore remain visible as before. The PostgreSQL migration also adds targeting fields to lesson drafts. No question bank, exam snapshot, scoring, or student progress data is rewritten.

Part 3 remains separate: mobile-responsive admin workspace and institution/settings controls.
