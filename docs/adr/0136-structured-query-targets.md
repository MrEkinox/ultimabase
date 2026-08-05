# ADR-0136: Structured Query targets for JSON and object fields

- Status: accepted
- Date: 2026-08-05
- Extends: ADR-0052, ADR-0053, ADR-0083, ADR-0091

## Context

`jsonField` and `objectField` share structured PostgreSQL storage, but Query
previously exposed only whole-document JSON equality. Database-prefixed builder
names would leak one adapter's vocabulary and duplicate the same logical
operations for typed and untyped structures. Dot-separated field strings would
also make declared names containing dots ambiguous for transports.

## Decision

Query adds first-class structural containment, key, extracted-path, and
advanced JSONPath leaves.
The public immutable builders use `contains`, `containedBy`, `hasKey`,
`hasAnyKeys`, and `hasAllKeys` for both `jsonField` and `objectField`.
`contains` remains the existing substring builder for string targets; the exact
field or path capability selects structural versus string semantics.

`fieldPath(field, segments)` creates a typed path target. AST leaves remain
flat: they retain the root logical field and an optional immutable segment
array beside the operator value. Segments are never joined, so a declared field
named `profile.name` remains different from `['profile', 'name']`.

Typed object paths recurse only through non-list object fields. Their terminal
field controls the available operators and exact operand. Unstructured JSON
paths accept portable `JsonValue` operands after the known root. Equality,
membership, null, string matching, structural containment, and key operations
may target the corresponding extracted value. Ordered extracted comparisons
remain unavailable until adapters can preserve every nested scalar's logical
ordering rather than comparing encoded JSON representations.

Object containment accepts recursively partial declared values, snapshots each
supplied branch through its field contract, and rejects unknown keys. Object key
operators retain the exact declared key union. JSON containment and keys remain
dynamic but still use the safe portable JSON domain rather than `any`.
Because persisted `objectField` values contain every declared property under
the canonical-null contract, root key tests on them are usually tautological;
they remain available for parity and for extracted dynamic JSON branches.

Adapters implement recursive structural containment and top-level key tests.
For JSON arrays, a key test matches a top-level string element, following the
same semantics as a JSONB key test. Missing extracted paths do not match a
value. Path null tests match a JSON null value rather than treating a missing
path as canonical field null.

PostgreSQL lowers these nodes to parameterized `@>`, `<@`, `?`, `?|`, `?&`,
`#>`, and `#>>` operations. Paths, keys, and serialized operands are driver
parameters. Typed partial values use the compiled child codecs before JSONB
serialization.

`jsonPathExists(target, expression)` and `jsonPathMatches(target, expression)`
are explicit advanced escape hatches for JSONPath existence and boolean
predicate evaluation. Only `expression.source` is intentionally untyped.
`expression.variables` remains an immutable `JsonObject`, the target remains
restricted to JSON or object structures, and the flat AST stores `source` and
`variables` directly beside `field` and optional `path`. This keeps the
operation serializable through REST and GraphQL without claiming that
TypeScript can interpret arbitrary JSONPath source text.

PostgreSQL compiles expressions without variables through `@?` and `@@` so GIN
index support remains available. Expressions with variables use
`jsonb_path_exists` and `jsonb_path_match`, with parameters for the source and
JSONB variable object. The fixed silent mode preserves the missing-structure
behavior of the operators. On typed objects, JSONPath observes the encoded JSONB representation;
developers using this advanced escape hatch must account for child storage
codecs such as bigint string encoding.

## Consequences

- JSON and typed objects share one developer vocabulary and one AST family.
- Transports can encode path segments and operators directly without parsing
  dotted names or PostgreSQL syntax.
- `objectField` autocomplete preserves declared paths, partial values, and keys;
  `jsonField` remains dynamically structured without exposing `any`.
- Adapter visitors must distinguish string `contains` from structural
  `contains` through the resolved target field metadata.
- JSONPath remains intentionally untyped only inside its explicit expression
  source; ordinary object paths and operands retain exact inference.
