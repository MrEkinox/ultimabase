# 5101: Consolidate transport mutation-data traversal

- Status: completed
- Milestone: 51
- Packages: `@ultimabase/core`, `@ultimabase/rest-plugin`, `@ultimabase/graphql-plugin`
- Depends on: 5001
- ADR: ADR-0228, ADR-0238, ADR-0243

## Goal

Make Core's transport-neutral mutation-data and nested-write shape the single
recursive traversal used by REST and GraphQL wire decoders, while each
transport retains all value conversion, command validation, identity, and error
policy.

## Acceptance criteria

- [x] Core exports one typed immutable mutation-data transformer covering
      persisted, virtual, and unknown fields plus nested pointer and relation
      target data.
- [x] The transformer accepts one transport-owned field callback and contains
      no REST, GraphQL, HTTP, scalar-codec, UUID-wire, or public-error policy.
- [x] REST retains exact virtual-field rejection, nested-command validation,
      UUID-v7 identity decoding, numeric tags, field codecs, and flat
      relationship rejection.
- [x] GraphQL retains exact wrapper decoding, scalar/plugin codecs, generated
      schema validation assumptions, and malformed-value pass-through.
- [x] Runtime tests protect recursive pointer create/update, relation
      create/update, declaration classification, and malformed structural
      pass-through.
- [x] Type tests protect the public callback context and unknown result type.
- [x] Package and public transport-author documentation describe the shared
      boundary.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Mutation HTTP bodies, GraphQL arguments, projections, or bulk envelopes.
- Core nested-write graph normalization or Runtime execution.
- New mutation commands, aliases, codecs, accepted shapes, or error mappings.
- Sharing REST UUID validation or GraphQL coercion through Core.

## Documentation impact

Both. The Core, REST, and GraphQL package READMEs now document the shared
traversal and retained transport policies, and the public plugin-author guide
shows the mutation-data transformer beside the existing filter transformer.
Core schema examples were reviewed and remain accurate because this change does
not alter schema declarations, inference, registry behavior, validation plans,
or application-facing nested-write commands.

## Outcome

The two transport-owned recursive walkers were replaced by one Core
`transformSchemaMutationDataInput()` function. Its callback classifies
persisted, virtual, and unknown fields while leaving all wire conversion and
rejection policy in REST and GraphQL. Core recursively follows only pointer
`create`/`update` data and relation `create`/`update[].data` using resolved
schema targets.

Production TypeScript added 189 lines and removed 212, a net reduction of 23.
Focused coverage proves field classification, pointer and relation recursion,
malformed structural pass-through, public typing, REST's strict behavior, and
GraphQL nested bigint and numeric-update decoding. Repository-wide typecheck,
545 test files with 2,581 tests, lint, build, 66 website documentation tests,
and issue validation pass.
