# ADR-0222: Sparse Access resolves granular secure defaults

- Status: accepted
- Date: 2026-09-01
- Refines: ADR-0168, ADR-0169, ADR-0204

## Context

Schema read Access distinguishes `one`, `many`, `count`, and `exists`, but its
grouped `allow` declaration required all four properties. A policy author who
wanted to enable only `count` therefore had to repeat three unrelated denials.
The requirement also prevented the existing application-local Access default
from governing capabilities omitted from an otherwise detailed read policy.

The Access plugin was permissive when `default` was omitted. Its former combined
operation and field fallback was also too coarse: an application could not
authorize most operations while denying only `count`, and a field-wide fallback
duplicated the natural meaning of an absent field restriction.

The desired operation contract is exact schema decision, then plugin default,
then denial. Compatible plugin contributions remain independent monotonic
restrictions and must not become an alternative grant source.

## Decision

The grouped `access.read.allow` object is sparse. Each present `one`, `many`,
`count`, or `exists` property contributes its exact rule. An omitted property
contributes no rule and therefore uses the configured Access operation default.
Unknown properties and invalid rule values remain setup errors.

`accessPlugin()` without a `default` option is equivalent to
`accessPlugin({ default: false })` for operations. The option accepts either one
boolean or a static operation-family object with `read`, `create`, `update`,
`upsert`, and `delete` booleans. The `read` branch directly accepts sparse
`one`, `many`, `count`, and `exists` booleans because it has no row or item
policy requiring an `allow` namespace. Every omitted operation family or read
capability denies. Dynamic `where`, `item`, and callback rules are deliberately
excluded because defaults are static operation fallback, not schema policy.

For each operation, an exact developer schema rule is evaluated when present.
Only its absence consults the matching plugin default; absence from both denies.
Compatible provider contributions are evaluated afterward through logical
`AND`. They can deny or narrow an allowed base decision but cannot grant one
that the schema/default resolution denied.

Fields have no plugin-wide default. An undeclared field channel allows, while an
exact developer field declaration or compatible provider contribution may
narrow it. This keeps field Access opt-in without weakening explicit
restrictions.

The direct boolean or callback read declaration remains shared by all four read
capabilities. Provider contributions use the same sparse normalization and
monotonic composition as developer declarations. Runtime order, Master bypass,
row filters, item rules, field channels, and protected-policy semantics do not
change.

## Consequences

- `allow: { count: true }` enables only counting under the implicit secure
  operation default.
- An exact `create: true` or `count: true` schema rule wins over a corresponding
  `false` plugin default. Omitted operations still inherit their defaults.
- A default can allow `one`, `many`, and `exists` while denying only `count`
  without repeating the policy on every schema.
- An empty grouped declaration is valid and delegates every read capability to
  its configured default.
- Compatible providers preserve monotonic security regardless of the base
  decision: provider `true` cannot grant, while provider `false` still denies.
- Undeclared fields remain readable and writable; exact field restrictions keep
  combining through logical `AND`.
- Existing applications that relied on implicit permissive Access must opt in
  with `default: true` or add exact declarations.
- Sparse declarations stay application-local and do not encode the plugin
  default into schema metadata or generated declarations.
