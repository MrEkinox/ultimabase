# ADR-0277: Schema specialization has one Core-native boundary

- Status: accepted
- Date: 2026-09-28
- Supersedes: the separate `Schema.defineWithStatics()` and `Schema.defineWithCapabilities()` construction paths
- Refines: ADR-0119, ADR-0175, ADR-0254
- Approval: user authorized the complete future-complexity reduction milestone on 2026-09-28

## Context

Optional packages sometimes need to create an ordinary immutable schema class
while also attaching package-owned static helpers or persisted-result commands.
Core exposed separate statics-only and class-capability construction paths, but
Password Auth and Roles still had to cast `Schema` and the resulting class
through `unknown` to recover their final public types. Adding a third kind of
specialized schema would therefore repeat both the construction choice and the
type bridge.

Application schemas do not have this problem. `Schema.define()` remains the
complete ordinary declaration path and must stay the easiest API.

## Decision

Core exposes one low-level package-authoring primitive:
`Schema.defineSpecialized(options, createCapabilities)`. Its factory always
returns the same explicit shape:

- `statics` contains package-owned class helpers and nominal identity markers;
- `results` contains commands that Core attaches only to trusted persisted
  schema results.

Core creates one ordinary schema class, invokes the factory with its exact
typed capability context, rejects collisions, attaches string or symbol static
keys as non-enumerable immutable properties, registers persisted-result
commands, and freezes the final class. The factory receives no application,
adapter, Runtime, authority, or mutable prototype.

`Schema.defineWithStatics()` and `Schema.defineWithCapabilities()` are removed
without aliases. Password Auth and Roles use the canonical primitive directly.
Password Auth's nominal User marker is a real private symbol capability, so its
schema definition and precise authentication methods compose without a result
cast. Roles receives the exact self schema in its capability context and no
longer retypes either `Schema` or the returned class.

## Consequences

- A package author makes one choice regardless of whether a specialization has
  statics, persisted commands, or both.
- Reserved fields, exact schema identity, generated contracts, and class
  freezing retain their existing behavior.
- Private symbol markers no longer need a type-only assertion and remain absent
  from enumeration and Typegen.
- Existing direct users of the two pre-release low-level methods must move to
  `defineSpecialized()` and return both explicit capability maps.
- Ordinary developers continue to use `Schema.define()` and see no additional
  options or concepts.

## Rejected alternatives

- Keeping the two old methods as aliases would preserve the API choice and the
  duplicate implementation path this decision removes.
- Moving specialization into Plugin Kit would leave Core-only plugin authors
  with the same casts and make Core depend conceptually on a convenience layer.
- Runtime prototype patching would weaken immutable class identity and make
  ordering observable.
- A plugin-only schema compiler would duplicate ordinary schema compilation and
  generated-contract behavior.
