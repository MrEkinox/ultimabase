# ADR-0319: Validation transforms, schema checks and complete issues

- Status: accepted
- Date: 2026-10-11
- Refines: the Validation plugin records, ADR-0316 (rules in `.with`), ADR-0305 (client
  errors); applies ADR-0288
- Approval: decisions of the Validation review (`docs/handoff/revue-plugins/validation.md`,
  decisions 1 to 12, validated by the user on 2026-10-09); record accepted by the user on 2026-10-11

## Context

Field validators accept Standard Schema validators. Their output is not stored, function
validators and schema-level checks do not exist, an update validates every field, a mismatched
validator prints a 1 065-character type, Core's structural checks throw before the plugin and
hide its issues, and `updateMany` issues lack the target index.

## Decision

1. **Transforms.** The stored value is the validator's output (`z.string().trim().max(200)`
   trims then checks); the type checks that the output remains assignable to the field.
   Validation stays the last step before storage; formatting a value belongs in the validator,
   business logic (deriving, cross-checking) in Hooks `resolveInput`.
2. **Function validators.** `validation: (value) => true | 'message' | { message, code }` next
   to Standard Schema validators, without a library; `code` reaches the client.
3. **Schema checks.** `.with({ validation })` takes a function on the complete final item,
   `({ item }) => true | 'message' | { path, message, code? } | readonly issues[]`, or a
   Standard Schema object validator.
4. **Asynchronous validators** are accepted; documentation states that they run inside the
   transaction (a slow call holds locks) and that uniqueness belongs to a unique index.
5. **Scope.** A create validates every field; an update validates only the changed fields; a
   schema check always sees the complete item.
6. **Inputs and types.** A validator's input type may include `null`. A mismatched validator
   reports `validation must accept string, got number`; hovers use named types
   (`FieldValidator<string>`).
7. **All issues in one response.** Core's structural issues and the plugin's issues are
   collected into one `VALIDATION_ERROR`; every issue of every field and of each validator is
   reported; `updateMany` issue paths include the target index. REST (422, `details.issues`) and
   GraphQL (`extensions.details.issues`) carry the whole list.
8. **`check()`.** `ultimabase.plugin(validationPlugin).check(Todo, { data })` runs the same field
   and schema validation without writing or a transaction and returns `{ valid: true }` or
   `{ valid: false, issues }`.
9. **Kept.** The `VALIDATION_ERROR` issue format `{ path, message }`, no plugin option, no field
   type inferred from a validator.

## Consequences

- The old-form `validation` options follow the same types until 6.8.
- Tests: stored transforms and output typing, function validators with codes, schema checks in
  each form, async validators, changed-fields-only updates, `null` inputs, the mismatch message
  and named hovers, Core and plugin issues together, several failing fields, `updateMany` index
  paths, REST and GraphQL `issues`, `check()`; DX audit and form D bench.
- Documentation impact: both (Validation page and README, errors guide).

## Out of scope

Relation cardinality constraints (later, on need), sharing constraints with clients (OpenAPI and
GraphQL, migration 6.6).
