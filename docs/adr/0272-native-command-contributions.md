# ADR-0272: Command contributions are Core-native

- Status: accepted
- Date: 2026-09-25
- Refines: ADR-0261, ADR-0270, ADR-0271
- Approval: user explicitly approved removal of the low-level command provider APIs on 2026-09-25

## Context

Core already compiles application operations and schema mutations into one
canonical command graph. Contribution-first plugin authoring nevertheless
translates each command handler and transport binding into one of four generic
capability protocols before materialization:

- operation handlers;
- operation transport bindings;
- schema-mutation handlers;
- schema-mutation transport bindings.

Those protocols duplicate command identity, ownership, contribution IDs,
resource cleanup, conflict detection, privilege derivation, materialization,
and binding. They cannot be consumed as ordinary capabilities and Core rejects
providers that did not originate from the corresponding command contribution
factory. The capability layer therefore adds a second representation without
providing generic composition.

The low-level provider factories and specialized tokens are public even though
the documented authoring path is `contributeOperation()`,
`contributeOperationBinding()`, `contributeSchemaMutation()`, and
`contributeSchemaMutationBinding()`. Keeping both paths would preserve the
bridge; adapting the provider path back into native contributions would add a
compatibility layer. The user approved contribution-only command authoring.

## Decision

Command contributions become native members of Core's immutable plugin plan.
One compilation records command declarations, handler factories, transport
bindings, derived privileges, and exact owner-local contribution IDs.

The canonical command graph binds those native implementations directly. Core
materializes resource-backed handlers with the same application capability
factory context, callback attribution, privilege checks, and reverse cleanup
semantics used today. Transport bindings remain inert until an explicitly
selected transport plans or executes them.

Application operations and schema mutations keep distinct public definitions
and execution semantics. Schema mutations still load and lock their target,
run monotonic policy and Hooks, choose an owner-only physical effect, and use
the ordinary transaction pipeline. Only their duplicated registration and
binding machinery becomes common.

## Removed public authoring paths

The specialized command capability tokens, their provider factories, handler
wrapper factories, and provider-only contracts are removed. Authors use the
four contribution factories instead. Protocol and codec factories used inside
transport bindings remain public.

This removes an alternate registration form, not a product capability:

- direct and resource-backed handlers remain supported;
- independent same-owner transport binding contributions remain supported;
- application capability reads inside resource factories remain supported;
- operation and mutation transport codecs remain supported;
- deterministic conflicts, ownership, privileges, Typegen, cleanup, direct
  handles, REST, and GraphQL behavior remain supported.

## Materialization order

Static command declarations and inert transport bindings are validated before
application effects. Generic application capabilities materialize before
resource-backed command handlers so their declared requirements are available.
Command handlers materialize before plugin application setup and transport
planning callbacks can execute. Cleanup remains reverse owner order and clears
all command closures even after a cleanup failure.

## Rejected alternatives

- Keeping both native contributions and provider APIs retains two sources of
  truth.
- Compatibility adapters preserve the bridge and increase production code.
- Combining operation and schema-mutation execution would erase meaningful
  target, policy, transaction, and persistence semantics.
- Making command implementations an ordinary consumable capability would expose
  an unsupported replacement and lookup mechanism.
