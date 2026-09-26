# Current plan: Query filter input transformation

- Status: completed
- Milestone: 50
- Baseline: `d7163520`
- Current issue: 5001

The user authorized consolidating the duplicated Core-shaped filter traversal
in REST and GraphQL. Core will own only immutable recursion through logical
filters, relationship predicates, relation `count.where`, and structured `at`
paths. Each transport retains its wire codecs, validation assumptions, and
public errors.

Issue 5001 removed both transport-owned recursive walkers and REST's private
path resolver. Core now exports one immutable transformer while REST and
GraphQL each provide one operand codec. Production TypeScript adds 172 lines and
removes 208, a net reduction of 36, with exact nested relation, filtered count,
structured path, malformed-input, and public type coverage.

Repository-wide typecheck, 2,578 tests, lint, build, and 66 website
documentation tests pass.

No push is authorized.
