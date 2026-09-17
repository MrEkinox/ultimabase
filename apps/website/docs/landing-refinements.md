# Landing refinement handoff

- Request: implement the improvements identified in the landing review.
- Reviewed: 2026-09-18.
- Documentation impact: **both**.

## Delivered scope

The landing now uses one native Fumadocs Schema / Read / Write demonstration.
Each copyable snippet is paired with its model field types. All tab panels
share a grid cell; inactive panels use visibility to reserve space while
remaining excluded from keyboard and accessibility navigation. No fixed height
clips the code or enlarged text.

The Article example uses only title and published to keep the lesson focused.
The TypeScript checker verifies every displayed field type against real Typegen
output, including the nullable boolean and the absence of published from the
selected read result. The displayed fields are an explanatory subset of model
properties, not a replacement declaration or a simulated editor response.

A dedicated Commit / Rollback illustration explains automatic transactions and
hook-started database work. It replaces the transaction card; the remaining
three capabilities use lighter columns. The illustration follows the public
Transactions guide and ADR-0099, including the boundary between pre-commit
failure and external notifications after commit. It executes no database work.

The hero links directly to the runnable source example and states npm packages
are unpublished. The introduction and section copy are shorter. The remaining
Docs label becomes Documentation, and See the setup is a working anchor with
clearance for the fixed navigation. The black dark theme, native top bar,
absence of a footer, and standard documentation components are preserved.

No framework API, dependency, integration, or runtime behavior changed. Existing
public guides remain accurate; the website README describes the updated demo
and verification. All implementation is within the approved review scope.

## Verification

- `yarn website:validate`: all 58 content tests passed, including compilation of
  the displayed excerpts and compiler inspection of every displayed field type.
- `yarn website:test`: production build passed (121 generated pages), then all
  49 browser tests passed across 7 files.
- New browser coverage checks exact clipboard contents, all three tab states,
  stable panel heights, selected field lists, setup-anchor positioning, keyboard
  transaction navigation, both outcomes, and light/dark accessibility.
- `yarn website:typecheck` and `yarn website:lint`: passed without warnings.
- Changed files pass Prettier and `git diff --check`.
- Root framework runtime and PostgreSQL suites were not rerun; no backend code
  changed and static Typegen verification does not connect to a database.

Production full-page captures were reviewed at 1440px and 390px in both themes,
plus reflow at 320px, 768px, and 1024px. There is no horizontal page overflow.
At 390px the demonstration measures 839px instead of 1151px (27% shorter), while
code increases from 12px to 14px. All three tabs have identical panel heights
at the checked desktop and mobile widths. Page height changes from 6855px to
6503px at 390px despite adding explicit type and transaction explanations.

Local captures (not committed):

- `/tmp/ultimabase-landing-review/desktop-light.png`
- `/tmp/ultimabase-landing-review/desktop-dark.png`
- `/tmp/ultimabase-landing-review/mobile-light.png`
- `/tmp/ultimabase-landing-review/mobile-dark.png`
- `/tmp/ultimabase-landing-review/typed-read-390.png`
- `/tmp/ultimabase-landing-review/typed-read-1440.png`

No push or deployment is part of this handoff.
