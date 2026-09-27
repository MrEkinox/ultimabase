# Current plan: Canonical Query inclusion resolution

- Status: completed
- Milestone: 58
- Baseline: `9b10358f`
- Completed issue: 5801

Canonical object inputs, `QueryBuilder.include()`, and inclusion AST
normalization currently repeat the same relationship-field and target-schema
resolution. Replace those copies with one private Core resolver while retaining
the exact pointer/relation input capabilities, immutable AST, inferred result,
and Runtime behavior.

The change must produce a net reduction in production TypeScript and pass the
complete coverage gate plus every standard repository validation command.

No push is authorized.

## Outcome

One private Core resolver now validates the relationship field and target
schema used by canonical object inputs, `QueryBuilder.include()`, and inclusion
AST normalization. Production TypeScript is reduced by 19 lines,
`query/input.ts` is back below the 400-line warning threshold, and the complete
coverage gate passes without changing any public Query capability.
