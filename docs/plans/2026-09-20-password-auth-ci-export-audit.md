# Password Auth CI export audit

The user reported failed CI after pushing the four authentication commits through
89b6129b and asked why complete coverage ran.

## Findings

GitHub run 35506933113 passed the build, package jobs, repository checks, website,
and complete coverage. Its sole underlying failure was the Password Auth export
inventory in `optional-product-public-api.e2e.test.ts`; Quality propagated that
failure. The inventory omitted PasswordSignUpInput, PasswordUserAuthMethods,
PasswordUserAuthOptions, and PasswordUserReference, all already exported and
covered by the authentication API tests.

The changed-path action succeeded with CI_FULL=false. Replaying each changed
path through the selector identified only
`examples/minimal/.ultimabase/schema.generated.d.ts` as triggering the full
fallback. The planner inventories package workspaces only, so this example path
is unclassified under ADR-0251. Core changes in the same four-commit push also
explain broad reverse-dependency selection. No coverage or selection rule is
changed by this correction.

## Correction and validation

- Updated the explicit application API inventory to include the four public types.
- Moved the Password Auth inventory to a focused module to keep the shared
  catalog below its 600-line budget; its original imports remain available.
- Reproduced the exact missing-export assertion locally before the correction.
- Re-ran the complete public-export suite: 24 tests passed.
- Focused lint, formatting, and whitespace checks passed.
- Runtime sources and compiled packages are unchanged; another build, global
  typecheck, or coverage run is unnecessary for this inventory-only correction.
- No scope beyond the reported CI failure was implemented.

Documentation impact: internal engineering documentation.

This handoff records the CI diagnosis. The package README and public guide
already describe the exported authentication methods and signup contract, so
no public documentation change is required.
