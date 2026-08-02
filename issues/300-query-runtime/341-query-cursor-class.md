# 341: Add the QueryCursor value class

- Status: ready
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 305
- ADR: ADR-0056, ADR-0057, ADR-0084

## Goal

Encapsulate server-side cursor creation and verification in an immutable
`QueryCursor` class while keeping transport cursors opaque strings.

## Target developer experience

```ts
const cursor = QueryCursor.from(PostSchema, ordering, lastPost)
const token = await cursor.seal(cursorCodec)

const resumed = await QueryCursor.open(cursorCodec, token, PostSchema, ordering)
```

## Acceptance criteria

- [ ] `QueryCursor` owns one validated, versioned schema-and-order position and exposes immutable read-only metadata for adapter compilation.
- [ ] `from` preserves exact schema and order typing while validating that every required ordered value exists on the selected object.
- [ ] `seal(codec)` returns the existing opaque string token without storing secrets in Query.
- [ ] `open(codec, token, schema, ordering)` authenticates and validates compatibility before constructing an instance.
- [ ] The implementation reuses existing payload, ordering, sealing, and opening helpers instead of duplicating cursor validation.
- [ ] Tokens crossing REST, GraphQL, SDK, or other transport boundaries remain strings.
- [ ] Limit remains independent from cursor position and is not added to the class.
- [ ] Public methods and parameters provide concise English JSDoc, autocomplete, and compact hovers.

## Tests

- [ ] Runtime tests cover creation, sealing, opening, tampering, schema mismatch, ordering mismatch, and immutability.
- [ ] Compile-time tests cover ordered-field requirements and incompatible schemas.
- [ ] Language-service and packed-package tests verify autocomplete and readable QuickInfo.

## Out of scope

- Changing the version 1 cursor payload.
- Exposing decoded cursor contents to clients.
- Backward pagination, expiry, or key rotation policy.
