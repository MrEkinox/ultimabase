# Password Auth required User correction

User-requested scope: undo the general Pointer denial-as-absence change and
require a readable User for sign-up, login, and refresh. ADR-0253 supersedes the
corresponding decisions in ADR-0252 without rewriting its history.

## Acceptance

- [x] Restore ordinary Pointer read failure propagation.
- [x] Require a non-null User in operation snapshots, TypeScript, REST, and GraphQL.
- [x] Reject absent, row-filtered, and denied profiles without bypassing read policy.
- [x] Roll back sign-up, new login sessions, and refresh rotation on read failure.
- [x] Preserve individual field restrictions and the fresh authenticated read context.
- [x] Correct the affected public documentation and package contracts.
- [x] Complete focused and broader verification and compare coverage.

Documentation impact: both.

Password Auth documentation now requires a readable profile. Core's README,
Pointer example, and public relationships guide distinguish row filtering from
explicit denial. The existing principal representation is retained; removing
it is outside this correction. No unrelated Runtime or transport behavior changes.

## Validation

- Focused source tests: 18 files, 80 tests; no type errors.
- `yarn typecheck`, Core and Password Auth test typechecks, and `yarn constraints`: passed.
- `yarn build`: passed with package declaration/publication checks.
- Compiled Password Auth E2E: 6 files, 21 tests passed.
- Targeted ESLint on Password Auth and changed Core files: passed.
- Website content validation: 17 files, 66 tests; production build passed.
- Local LAN HTML, Markdown, and all 19 referenced JS/CSS assets return HTTP 200.
- Complete `yarn test:coverage`: 586 files, 2,687 tests passed, no type errors;
  existing thresholds passed in 462.29 seconds.
- The complete run exposed previously indirect coverage of private Core target
  normalization that depended on the removed auth behavior. Four focused Core
  tests now protect that existing private contract independently, including
  propagation without opt-in and rejection of forged policy errors. Auth result
  validation additionally rejects malformed logout acknowledgements.
- Final focused unit tests: 2 files, 10 tests passed, plus final lint and test
  typechecks. Their coverage-only run cannot meet whole-repository thresholds
  by itself; it exited nonzero for that reason, with all tests passing.
- Istanbul merged only the two affected production files from that focused run
  into the complete report after exact equality checks on statement, function,
  and branch instrumentation maps. Production code was unchanged between runs.
  No threshold, exclusion, or production behavior was changed to raise coverage.
- Against the immediately preceding 703-file report, every global and modified
  production-file percentage is stable or higher. No previously covered
  statement, function, or branch in unchanged files became uncovered.

| Metric     | Before                   | After                    |
| ---------- | ------------------------ | ------------------------ |
| Statements | 88.80% (25,510 / 28,725) | 88.81% (25,511 / 28,725) |
| Branches   | 81.86% (15,837 / 19,345) | 81.87% (15,839 / 19,345) |
| Functions  | 94.37% (5,323 / 5,640)   | 94.37% (5,323 / 5,640)   |
| Lines      | 89.36% (24,789 / 27,738) | 89.37% (24,791 / 27,739) |

Local evidence: `/tmp/ultimabase-strict-auth-coverage.log`,
`/tmp/ultimabase-strict-auth-coverage-comparison.json`, and the combined report
under `/tmp/ultimabase-strict-auth-final-coverage/`.
