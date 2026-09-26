# 5001: Consolidate transport filter traversal

- Status: completed
- Milestone: 50
- Packages: `@ultimabase/core`, `@ultimabase/rest-plugin`, `@ultimabase/graphql-plugin`
- Depends on: 4901
- ADR: ADR-0054, ADR-0224, ADR-0231

## Goal

Make Core's transport-neutral filter shape the single recursive traversal used
to transform REST and GraphQL wire operands before canonical query
normalization, while leaving every transport-specific conversion and error at
the transport boundary.

## Acceptance criteria

- [x] Core exports one typed immutable filter-input transformer covering logical
      filters, field operators, relationship predicates, relation `count.where`,
      and structured `at` paths.
- [x] The transformer accepts one transport-owned field-operand callback and
      contains no REST, GraphQL, HTTP, scalar, or plugin-codec policy.
- [x] REST retains exact strict malformed-wire rejection and canonical value
      decoding.
- [x] GraphQL retains exact scalar/plugin-codec decoding and validation
      assumptions.
- [x] Runtime tests protect nested logical, relationship, count, and structured
      path behavior for both transports.
- [x] Type tests protect callback context and result typing through the public
      Core export.
- [x] Package and public documentation describe the shared boundary where it is
      useful to transport authors.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Mutation-input traversal or write normalization.
- New filter operators, aliases, coercions, or accepted wire shapes.
- Moving transport codecs or public errors into Core.
- Changing the normalized query AST or Runtime execution.

## Documentation impact

Both. The Core query contract and package README now document the public
transformer, the REST and GraphQL package READMEs describe their retained codec
boundaries, and the public plugin-author guide shows the transport-author flow.

## Outcome

The two transport-owned recursive walkers and REST's private path resolver were
removed. Core now owns the stable filter structure through one
`transformQueryFilterInput()` function, while one callback per transport owns
only scalar/list conversion and error policy.

Production TypeScript added 172 lines and removed 208, a net reduction of 36.
Focused coverage proves direct operands, nested logical groups, pointer and
relation predicates, `count.where`, structured `at` paths, malformed structural
pass-through, public typing, REST strict decoding, and GraphQL scalar/plugin
coercion. Repository-wide typecheck, 2,578 tests, lint, build, and 66 website
documentation tests pass.
