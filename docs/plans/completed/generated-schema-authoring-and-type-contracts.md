# Generated schema authoring and type contracts

- Status: completed
- Started: 2026-08-09
- Paused: 2026-08-10
- Resumed and completed: 2026-09-02
- Governing decisions: ADR-0173, ADR-0175, ADR-0176, ADR-0177, ADR-0179

## Objective

Replace recursively inferred application schema contracts with deterministic
generated declarations while keeping TypeScript schema declarations and the
compiled plugin graph authoritative. Preserve exact schema, Query, mutation,
relationship, official-plugin, and open-kernel surfaces without requiring a
generated Runtime client.

## Completed order

Issues 801 through 807 established deferred compilation, FieldBuilder plugin
methods, compact generation, and generated public contracts. Issue 809 migrated
repository schemas, issue 811 completed one-dimensional list filters, and issue
812 removed redundant Access and Hooks aliases. After issue 1509 completed the
open-kernel surface, explicit user direction resumed issue 810 for the final DX
and performance audit.

## Outcome

Generated declarations now provide exact application items, create and update
inputs, filters, selections, inclusions, mutations, relationships, schema and
model handles, plugin operations, and installed direct options. Access, Hooks,
and Validation compose only when installed; independent alternatives retain
their own protocols. Removing plugins changes the deterministic fingerprint and
removes their contracts without changing Core.

The final 48-schema editor probe uses five isolated samples for recursive and
generated contracts. On the recorded machine, generated contracts reduced the
median semantic-check time by 21.1%, first-hover latency by 48.3%, and resident
memory by 14.7%. First-completion latency improved by 4.7%, while V8 heap use
was effectively unchanged. These measurements are fixture evidence, not a
performance guarantee.

## Verification

- `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn lint`, and
  `yarn format:check`
- `yarn test` — 352 files and 1,706 tests
- `yarn build` — all public workspace declaration, ATTW, and publint checks
- `yarn test:pack:built` — 19 files and 98 tests
- `yarn test:e2e:built` — 51 files and 201 ordinary plus PostgreSQL tests

Issue 808 remains deferred for manual generation, check/watch commands, build
integration, and read-only packaged startup fingerprint verification. ACL
hardening remains independently paused at issue 432.
