# ADR-0205: Protected policy contributions remain Core-owned

- Status: accepted
- Date: 2026-08-20
- Refines: ADR-0117, ADR-0189, ADR-0199, ADR-0200, ADR-0204
- Depends on: ADR-0189, ADR-0191, ADR-0199, ADR-0200, ADR-0204
- Refined by: ADR-0212, ADR-0218

## Context

The public Runtime constraint capability currently accepts operation guards,
opaque adapter constraints, and top-level field intersections. Extracting the
complete native Access engine proves that those definitions do not cover every
existing protected boundary. Official Access also needs private row filters,
stable mutation targets and outcomes, relation traversals, per-record nested
output restriction, and protected denial-as-missing behavior.

Exposing Core's mutable enforcement state would let a plugin inspect, clear, or
broaden another policy. Keeping those missing stages private for the official
Access implementation would instead create the Core-specific bridge forbidden
by ADR-0204.

ACL exposes its own persisted per-object policy model. Requiring ACL to depend
on the official Access package would couple that independent model to an engine
whose schema vocabulary it does not need, and would prevent ACL from protecting
an application that intentionally omits official Access.

## Decision

### Extend the existing Runtime constraint capability

Core extends `runtimeConstraintCapability`; it does not add a fifth Runtime
capability or a policy service registry. One exact public factory creates a
protected policy definition accepted by `provideRuntimeConstraint()` under the
existing `runtime:constrain` privilege.

A protected policy may participate at the operation, reevaluation, relation,
prepared-mutation, mutation-outcome, and final-result boundaries. Handlers
receive only the immutable logical values available at their boundary. They do
not receive accumulated enforcement state, another contribution's result,
adapters, persistence plans, commit controls, or authority grants.

Core accepts only monotonic effects from those handlers:

- a deny decision can reject but never grant over an earlier denial;
- row predicates append through logical `AND`;
- input and selection field sets intersect;
- a final nested result projection must be a structural subset of the value it
  received, preserving leaf values, collection order, and object identity
  metadata;
- relation, prepared-target, and mutation-outcome decisions are deny-only.

Core validates and applies every effect. It owns the opaque state and creates a
framework-branded protected denial when a contribution rejects. Private target
scopes may convert only that branded denial to an absent result. No plugin can
forge the brand by throwing a lookalike `FrameworkError`.

Multiple protected policies compose in deterministic capability-contribution
order. An absent protected policy contributes no handler, snapshot, or
per-request state.

### Access is one consumer, not the host

`@ultimabase/access-plugin` compiles its official schema and field declarations
into one protected policy contribution using only public Core contracts. It
owns official Access diagnostics and authoring, while Core owns only the generic
monotonic application of its returned effects.

Plugins that intentionally extend the official Access declaration protocol may
import its public contracts and use a non-ordering peer. Independent policy
engines define their own vocabulary and contribute protected policies directly.

### ACL is an independent protected policy

`@ultimabase/acl-permissions-plugin` contributes its persisted object policy
directly through the generic protected policy and adapter-constraint contracts.
It does not import, depend on, or peer with `@ultimabase/access-plugin`.

ACL therefore works with no official Access engine and composes monotonically
with official Access or an independent alternative when either is installed.
Roles and authentication-facing integrations provide neutral request subjects
through Core contracts and grant nothing by themselves.

The neutral subject contracts use request-subject vocabulary rather than
Access-product names. ACL, Roles, authentication providers, and community
policies may share them without selecting the official Access package.

### Atomic migration

Issue 1506's ACL, Roles, and PostgreSQL policy migration moves into issue 1504.
The repository never publishes a commit where Access has left Core but ACL
still targets the removed native registry. Issue 1506 remains as a merged
historical record and has no separate implementation commit.

## Consequences

- Community plugins gain the same protected row, relation, target, transition,
  and nested-output capabilities required by official Access and ACL.
- Core retains monotonic enforcement ownership without learning Access, ACL,
  roles, authentication, or another concrete policy vocabulary.
- ACL remains useful and secure independently of the official Access package.
- Official Access, ACL, and alternative policies can coexist because every
  protected effect narrows the same Core-owned envelope.
- Issue 1504 becomes a larger atomic change across Core, Access, ACL, Roles,
  PostgreSQL integration, Typegen, and testing.

## Non-goals

- Letting a policy replace an operation, persistence plan, result value, or
  another policy's state.
- Defining one universal Access authoring protocol for independent engines.
- Moving anonymous or trusted Master authority out of Core.
- Adding new ACL permissions, role semantics, or authentication behavior.
