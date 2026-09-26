# Current plan: Attributed callback runtime audit

- Status: stopped at audit gate
- Milestone: 49
- Baseline: `e63e07b6`
- Current issue: completed audit; implementation rejected

The user authorized the next debt reduction after milestone 48. Core Runtime,
Access, and Hooks currently maintain parallel async callback stacks and owner
dispatch even though application capability factories already receive one
Core-bound `ApplicationCallbackExecutor`.

Issue 4901 prototyped extracting only the shared attribution, stack, depth, and
recursion mechanism. The smallest behavior-preserving facade increased
production TypeScript by 88 lines before documentation because each engine
still required its distinct cancellation, error, diagnostic, lifetime, query
guard, and observer isolation adapters. Moving those policies into Core would
violate ADR-0189 and recreate a broad bridge.

The prototype was fully reverted. No production or public API change remains.
The next safe candidate is the duplicated Core-shaped filter traversal in REST
and GraphQL, but starting that separate milestone requires user direction.

No push is authorized.
