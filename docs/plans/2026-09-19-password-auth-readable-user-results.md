# Password Auth readable User results

The nullable-profile and Pointer-denial decisions recorded here were subsequently
corrected by [the required User follow-up](2026-09-20-password-auth-required-user.md).
The validation below describes the original implementation before that correction.

User-requested scope: return the readable User with sign-up, login, and refresh
through direct operations, REST, and GraphQL. Preserve coverage and logout's
contract. ADR-0252 records the approved extension of the pre-release auth result.

## Acceptance

- [x] All three operations return a nullable profile with their principal and session.
- [x] Refresh reads the current profile and uses the newly rotated session identity.
- [x] A Master or differently authenticated caller cannot widen the profile read.
- [x] Installed row/field restrictions apply; hidden profiles preserve authentication.
- [x] Unexpected profile failures roll back credential/session changes.
- [x] REST and GraphQL reuse ordinary schema output encodings without generated User CRUD.
- [x] Public documentation and the package contracts describe the same result.
- [x] Complete final validation and compare coverage with the existing baseline.

## Necessary supporting fixes

Pointer reads previously raised a transaction-poisoning policy error despite the
public relationships guide documenting a nullable hidden target. They now use the
existing Core denial-as-absence mechanism already used by model/relation scopes.
No new permission bypass or read option is introduced. The pointer schema example
was reviewed and documents this behavior.

Core operation snapshots retain native binary values inside nominal persisted
models while still rejecting mutable containers. REST operation output recognizes
application-owned model prototypes and reuses schema codecs. Both changes are
necessary for custom User fields; neither introduces transport logic into Core.

Documentation impact: both.

The public Password Auth and REST guides, package READMEs, pointer example, and
ADR-0252 cover result shape, authorization, transaction behavior, and encoding.

## Validation

- `yarn typecheck`, package test typechecking, and `yarn constraints`: passed.
- `yarn build`: passed, including package declaration and publication checks;
  affected Password Auth and REST packages were rebuilt after the final guards.
- Compiled Password Auth PostgreSQL E2E: 5 files, 20 tests passed.
- `NODE_OPTIONS=--max-old-space-size=8192 yarn lint`: passed with existing
  file-size warnings. The default 4 GiB Node heap exhausted memory while linting
  all packages; the retry changes no repository setting. Final targeted lint also passed.
- Website validation: 17 files, 66 tests; production build and browser checks:
  8 files, 56 tests. Website typecheck and lint passed.
- All 12 JSON examples parse; all four documented GraphQL mutations validate
  against the compiled schema with the custom User. User has no generated query root.
- Local LAN documentation page and its 19 referenced JavaScript/CSS assets return HTTP 200.
- `yarn test:coverage`: 586 files, 2,687 tests passed; no type errors, all
  repository thresholds passed. Duration: 430.88 seconds.
- A final assertion covers rejection of a model with the wrong schema in REST.
  The focused suite passed all 5 tests. Its JSON coverage was merged with the
  complete run using Istanbul after checking that all three instrumentation maps
  for the production file were identical. The focused run alone intentionally
  does not satisfy monorepo-wide thresholds; no threshold or exclusion changed.
- Comparison against the previous 702-file baseline retains every existing
  production file and adds the profile reader. All four global percentages and
  every modified production file's percentages are stable or higher. No formerly
  covered statement, function, or branch in unchanged files became uncovered.

| Metric     | Before                   | After                    |
| ---------- | ------------------------ | ------------------------ |
| Statements | 88.76% (25,469 / 28,694) | 88.80% (25,510 / 28,725) |
| Branches   | 81.77% (15,787 / 19,305) | 81.86% (15,837 / 19,345) |
| Functions  | 94.34% (5,318 / 5,637)   | 94.37% (5,323 / 5,640)   |
| Lines      | 89.31% (24,751 / 27,712) | 89.36% (24,789 / 27,738) |

Local evidence: `/tmp/ultimabase-auth-profile-coverage-final.log`,
`/tmp/ultimabase-auth-profile-coverage-comparison.json`, and the merged HTML/JSON
report under `/tmp/ultimabase-auth-profile-final-coverage/`.
