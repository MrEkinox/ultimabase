# ADR-0204: Access is one vertical plugin

- Status: accepted
- Date: 2026-08-20
- Refines: ADR-0189, ADR-0194, ADR-0202
- Depends on: ADR-0189, ADR-0190, ADR-0191, ADR-0199, ADR-0200, ADR-0203

## Context

ADR-0194 planned a dependency-light `@ultimabase/access-contracts` package so
the official Access engine, its policy providers, and alternative engines could
share protocol identity without importing an implementation package.

That split gives every official-compatible provider two Access packages to
understand even though importing `@ultimabase/access-plugin` installs no
behavior. It also forces genuinely alternative engines to adopt the official
provider and decision vocabulary when they may intentionally expose a different
policy model and developer experience.

Hooks established the simpler vertical-package model in ADR-0202. Access can
use the same model without coupling provider lifecycle order to the engine,
because ADR-0203 peers validate package compatibility without adding an order
edge.

## Decision

### One official package

UltimaBase publishes one Access package: `@ultimabase/access-plugin`. It owns
its public schema and field authoring contracts, decision and provider types,
versioned capability tokens, plan compiler, diagnostics, and Runtime
integration.

Importing the package installs no behavior. The application must configure its
exported plugin definition explicitly. ACL and other plugins that intentionally
contribute to the official Access engine import its public contracts from this
package and declare the engine through ADR-0203's non-ordering `peers` contract
when their contributions require a configured compatible engine.

There is no `@ultimabase/access-contracts` package.

### Alternatives are independent engines

A community policy engine uses Core's public schema-extension, Typegen,
capability, protected-constraint, middleware, persistence-plan, transaction,
and diagnostic contracts. It owns its vocabulary and capability identity and
does not depend on the official Access package.

An alternative that intentionally supports official Access providers may
instead import and implement the official public protocol and declare the
corresponding peer relationship. Independent alternatives are not required to
do so. Deterministic conflicts continue to follow the actual option namespaces,
capabilities, protected constraints, model surfaces, and middleware claimed by
the installed plugins; Core does not introduce a universal policy-engine token.

### Core authority remains independent

Core continues to own `anonymous` and trusted server-side `master` authority,
protected monotonic enforcement, and master auditing. Neither the official
Access package nor an alternative creates, relocates, or makes Master
transport-forgeable.

## Consequences

- Official Access extension authors have one dependency and one documentation
  surface.
- Official-compatible ACL and policy providers depend on and peer with the
  official Access package without manufacturing lifecycle cycles.
- Independent alternatives remain free to expose a different policy model
  through the generic public kernel.
- Issue 1504 creates only `@ultimabase/access-plugin`; issues 1506 and 1507
  validate the compatible-provider and independent-alternative paths.

## Non-goals

- Changing accepted Access decisions, ordering, fail-closed behavior, or
  monotonic enforcement.
- Moving Master or master-key configuration out of Core.
- Requiring independent alternative engines to support official Access
  providers.
