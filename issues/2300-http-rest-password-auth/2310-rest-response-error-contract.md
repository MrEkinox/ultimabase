# 2310: Stabilize REST responses and errors

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/http-plugin`
- Depends on: 2304, 2307, 2308, 2309, 2320
- ADR: ADR-0042, ADR-0226 and the issue 2302 HTTP and REST contract

## Goal

Encode successful Runtime results and safe public failures into the accepted
experimental REST v1 contract without exposing internal diagnostics.

## Acceptance criteria

- [ ] Every operation maps to one documented HTTP status and JSON envelope.
- [ ] Framework and namespaced plugin public error codes retain their stable
      code, public message, safe details, and retryability where applicable.
- [ ] Application selection, sensitive-header, context, and credential failures
      that occur before route dispatch use the protocol-neutral HTTP envelope;
      REST owns failures only after its handler starts.
- [ ] Unknown exceptions, stacks, internal details, plugin configuration,
      SQL, credentials, and policy internals never cross the wire.
- [ ] Request IDs are present in errors and the documented response metadata.
- [ ] Dates, bigint, decimal, binary, object, pointer, relation, list, null, and
      absent values follow the accepted wire representation exactly.
- [ ] Content negotiation and unsupported media types fail deterministically.
- [ ] Master and session credentials never appear in bodies, headers, cache
      metadata, diagnostics, or serialization failures.
- [ ] Credential-bearing and private responses use the accepted cache policy and
      cannot be reused across application, origin, or authorization contexts.
- [ ] The experimental protocol version is observable and incompatible future
      versions fail explicitly rather than being guessed.

## Tests

- [ ] Complete success and error matrices cover Core operations, plugin
      operations, malformed requests, policy denial, validation, conflict,
      adapter failure, and unknown exceptions.
- [ ] Snapshot tests assert secret and internal-detail absence.

## Out of scope

- Localization, HTML errors, OpenAPI, streaming, file responses, and GraphQL
  error mapping.
