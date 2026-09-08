# 2402: Compile typed nested inputs and the Core graph

- Status: completed
- Milestone: 24
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2401
- ADR: ADR-0243

## Goal

Generate exact schema-dependent nested mutation inputs and normalize them into
one immutable callback-free Core graph without executing effects.

## Acceptance criteria

- [x] `createOne` and `updateOne` infer only the nested commands legal for each
      pointer or relation field, target schema, root kind, and nullability.
- [x] Nested target `create` and `update` inputs recurse with exact field types,
      autocomplete, readable hovers, and no `any` or generated Runtime dependency.
- [x] Field-bound relation handles and nested identity commands use canonical
      target IDs according to ADR-0243, with a complete superseded-input removal
      audit and no compatibility overload hidden from inference.
- [x] One immutable graph records exact schema, field, target, command, input,
      source path, declaration order, and provenance without executable
      callbacks, transport values, adapters, or policy objects.
- [x] Normalization validates plain records, known keys, command exclusivity,
      duplicate or contradictory IDs, recursive depth, total operation count,
      and foreign or missing schema targets before any effect.
- [x] Scalar and embedded-object data remains the existing canonical mutation
      input; relation command objects never enter stored-value validation as
      logical field values.
- [x] JavaScript can normalize the same compiled application graph without a
      generated declaration file.

## Tests

- [x] Runtime normalization, compile-time, TypeScript language-service, source
      export, compiled export, and Typegen-free fixtures cover recursive and
      invalid graphs.
- [x] Core schema examples and package documentation show the canonical input.

## Out of scope

- Executing a graph, opening a transaction, changing an adapter, or exposing a
  transport input.
