# 2310: Stabilize REST responses and errors

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/http-plugin`
- Depends on: 2304, 2307, 2308, 2309, 2320
- ADR: ADR-0042, ADR-0226 and the issue 2302 HTTP and REST contract

## Goal

Encode successful Runtime results and safe public failures into the accepted
experimental REST v1 contract without exposing internal diagnostics.

## Acceptance criteria

- [x] Every operation maps to one documented HTTP status and JSON envelope.
- [x] Framework and namespaced plugin public error codes retain their stable
      code, public message, safe details, and retryability where applicable.
- [x] Application selection, sensitive-header, context, and credential failures
      that occur before route dispatch use the protocol-neutral HTTP envelope;
      REST owns failures only after its handler starts.
- [x] Unknown exceptions, stacks, internal details, plugin configuration,
      SQL, credentials, and policy internals never cross the wire.
- [x] Request IDs are present in errors and the documented response metadata.
- [x] Dates, bigint, decimal, binary, object, pointer, relation, list, null, and
      absent values follow the accepted wire representation exactly.
- [x] Content negotiation and unsupported media types fail deterministically.
- [x] Master and session credentials never appear in bodies, headers, cache
      metadata, diagnostics, or serialization failures.
- [x] Credential-bearing and private responses use the accepted cache policy and
      cannot be reused across application, origin, or authorization contexts.
- [x] The experimental protocol version is observable and incompatible future
      versions fail explicitly rather than being guessed.

## Tests

- [x] Complete success and error matrices cover Core operations, plugin
      operations, malformed requests, policy denial, validation, conflict,
      adapter failure, and unknown exceptions.
- [x] Snapshot tests assert secret and internal-detail absence.

## Out of scope

- Localization, HTML errors, OpenAPI, streaming, file responses, and GraphQL
  error mapping.

## Verification

- Focused REST typecheck, lint, and unit suites passed with 12 files and 57
  tests, including the complete success matrix, safe error snapshots, field
  encodings, HTTP ownership, negotiation, and leak checks.
- `yarn constraints`, `yarn check:issues`, `yarn format:check`, `yarn typecheck`,
  `yarn test`, `yarn lint`, and `yarn build` passed. The complete suite passed
  385 files and 1,872 tests; lint retained 76 pre-existing centralized
  line-budget warnings and no errors.
