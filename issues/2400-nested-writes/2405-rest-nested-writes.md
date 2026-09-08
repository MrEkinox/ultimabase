# 2405: Expose nested writes through REST

- Status: planned
- Milestone: 24
- Packages: `@ultimabase/rest-plugin`
- Depends on: 2404
- ADR: ADR-0228, ADR-0243

## Goal

Decode REST v1 nested commands from concise create and patch bodies and delegate
the normalized graph through Core's application request executor.

## Acceptance criteria

- [ ] Create and patch bodies accept the exact pointer and relation command
      objects from ADR-0243 without adding a second route or wrapper envelope.
- [ ] Field-bound identity inputs are canonical IDs; class names and tagged
      pointer mutation values follow ADR-0243's replacement decision.
- [ ] Nested target create and update values recursively reuse REST's existing
      schema-aware scalar, embedded, list, and plugin-field codecs.
- [ ] Body limits, depth and operation limits, unknown keys, command conflicts,
      duplicate IDs, malformed JSON, cancellation, and content negotiation fail
      at their existing safe boundaries before partial work.
- [ ] REST owns only wire decoding and response encoding. Its normalized command
      contains no URL, request, route, header, response, credential, or
      REST-specific Runtime node.
- [ ] Existing `select` and `include` query parameters shape only the final root
      result after atomic nested execution.
- [ ] Safe error status, code, request ID, redaction, application selection,
      session, and audited Master behavior remain unchanged.

## Tests

- [ ] Source, browser Fetch, built, packed-package, multi-application, malformed
      input, secret-redaction, authenticated, Master, and PostgreSQL REST tests
      cover the complete supported command matrix.

## Out of scope

- New routes, bulk nested bodies, transport-specific graph execution, nested
  delete/upsert, or arbitrary unique-filter connect.
