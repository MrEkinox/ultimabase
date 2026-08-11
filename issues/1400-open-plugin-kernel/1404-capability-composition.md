# 1404: Compose capability providers, decorators, and replacements

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1402, 1403
- ADR: ADR-0186, ADR-0190, ADR-0191

## Goal

Resolve `provide`, `require`, `decorate`, and privileged `replace`
contributions into one immutable application-local capability graph.

## Acceptance criteria

- [ ] Single capabilities reject competing providers unless one authorized replacement explicitly targets the replaced owner.
- [ ] Multiple capabilities retain independent dependency-first providers, reject decoration, and allow replacement of one exact contribution without changing its position.
- [ ] Pipeline capabilities compose handlers by dependencies, plugin position, and registration order; replacement targets one exact handler.
- [ ] Single and pipeline decorators wrap the complete capability with the earliest dependency outermost, so entry and exit order are deterministic.
- [ ] Replacements require the declared replacement privilege, preserve provenance, and never inherit the replaced provider's privileges or master authority.
- [ ] Replacement chains are linear and inspectable; branches, cycles, missing owners, incompatible versions, duplicate decorators, and ambiguous replacements fail before static compilation.
- [ ] Declaration values are immutable before compilation; application providers materialize only during setup and dispose through their exact owner lifecycle.
- [ ] Plugins resolve only read-only capability views permitted by their declared requirements.

## Tests

- [ ] Runtime tests cover the complete cardinality matrix, both lifetimes, version mismatch, provider and wrapper order, exact replacement position, chains, branches, cycles, nested instances, cleanup, and application isolation.
- [ ] Type and packed tests protect exact provider, decorator, consumer, and inspection types.

## Out of scope

- Schema, Typegen, or Runtime-specific capability implementations.
- Hot replacement after application compilation.
