# ADR-0296: Treat added diagnostic context as a fix

- Status: accepted
- Date: 2026-10-08
- Refines: ADR-0288 (which public changes need their own ADR)
- Approval: the user delegated this decision on 2026-10-08

## Context

ADR-0288 requires one validated ADR per change of a public contract, and
`AGENTS.md` counts error messages as contract. Applied literally, every
clearer server-side diagnostic would need its own ADR, although nothing can
depend on the old wording in a way the change breaks. On 2026-10-08 several
messages hid the actionable part of a failure: the offending value, the
environment variable at fault, the driver code, or the misspelled method.

## Decision

Improving a server-side diagnostic message is a bug fix, without a dedicated
ADR, when all of these hold:

- it only adds or corrects non-secret context: the received value of a
  non-secret input, the source of a configuration value, a driver code, a
  suggestion, or the cause that was previously dropped;
- the error code, error class, `publicMessage`, retryability and HTTP status
  stay unchanged;
- a regression test asserts the new message, and the old message text stays a
  prefix where an existing test pinned it, or the commit explains the update.

Secrets, credentials, connection strings, driver messages and user data never
enter a message. Any other change of an error contract still follows ADR-0288.

## Changes recorded under this decision

- Core names an unavailable field-builder method and suggests built-in ones;
  the schema compilation error includes the cause of an unresolved field map.
- Private storage rejects every non-Core field option by name, without naming
  a plugin.
- PostgreSQL connection verification names the SQLSTATE or Node system code.
- The HTTP plugin states the accepted `requestTimeoutMs` range.
- Typegen's loader names an omitted `sourcePath` or `exportName`.
- `readVitestPoolId` reports an unset `VITEST_POOL_ID` distinctly.
- GraphQL names `ULTIMABASE_CURSOR_SECRET` when the short value came from it.
- The Hono `PORT` and create-app enumerated-flag errors echo the received value.

## Consequences

Diagnostics can improve continuously before and after the first release.
Reviewers check the conditions above instead of requesting an ADR.
