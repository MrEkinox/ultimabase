# 1404: Compose capability providers, decorators, and replacements

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1402, 1403
- ADR: ADR-0186, ADR-0190, ADR-0191

## Goal

Resolve `provide`, `require`, `decorate`, and privileged `replace`
contributions into one immutable application-local capability graph.

## Approved public contract

Every token owns the exact deterministic conversion from ordered provider
values to its consumer view. Core supplies a one-element tuple for `single`
tokens and an ordered immutable list for `multiple` and `pipeline` tokens:

```ts
const auditCapability = defineCapability<AuditProvider, AuditConsumer>()({
	capabilityId: 'community.audit',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => ({
		record: (message) => provider.write({ message }),
	}),
})
```

`compose` is required for every token, remains private executable protocol
behavior rather than inspection metadata, and runs only after final provider
selection. Decorators then wrap the resulting consumer view in reverse
application order so the earliest dependency is outermost.

Every provider, decorator, and replacement has a stable non-empty local
`contributionId`, unique for one owner and token. Provider syntax is explicit
about its lifetime:

```ts
const formatProvider = provideCapability(formatCapability, {
	contributionId: 'json',
	value: { format: 'json' },
})

const auditProvider = provideCapability(auditCapability, {
	contributionId: 'primary',
	create: ({ capabilities }) => ({
		value: createAuditProvider(capabilities.get(requiredTransport)),
		dispose: () => closeAuditProvider(),
	}),
})
```

Declaration providers require `value`; application providers require `create`.
An application factory always returns `{ value, dispose? }`, may be asynchronous,
and receives an owner-bound context. This issue exposes only `capabilities` in
that context; later issues add exact privileged facades only when the owner has
the corresponding active grant. There is no generic privilege or registry
lookup.

Decorators and replacements are separate declarations:

```ts
const metricsDecorator = decorateCapability(auditCapability, {
	contributionId: 'metrics',
	decorate: (consumer) => withMetrics(consumer),
})

const auditReplacement = replaceCapability(auditCapability, {
	contributionId: 'buffered',
	target: {
		owner: { pluginId: 'community.audit', instanceId: 'primary' },
		contributionId: 'primary',
	},
	create: () => ({ value: createBufferedAuditProvider() }),
})
```

`decorateCapability` is valid only for `single` and `pipeline` tokens and
requires `capability:decorate`. `replaceCapability` uses the same
lifetime-specific `value` or `create` contract as a provider, requires
`capability:replace`, and targets one exact provider or earlier replacement by
structured owner plus contribution ID. A replacement occupies the target's
original position and retains its own owner, privileges, lifecycle, and
provenance.

Plugins read capabilities only through the exact requirement objects already
declared in their manifest:

```ts
setup: ({ capabilities }) => {
	const audit = capabilities.get(requiredAudit)
	const cache = capabilities.get(optionalCache) // CacheConsumer | undefined
}
```

Token reads and structurally recreated requirements are rejected. Capability
requirements add provider-to-consumer lifecycle dependencies. Core resolves
application factories lazily during the setup phase, detects capability cycles,
materializes only final unreplaced contributions, and completes all capability
values before plugin `setup()` callbacks run. Cleanup follows reverse dependency
order: a plugin's `dispose` hook runs before Core disposes application capability
resources owned by that plugin, in reverse contribution order.

## Acceptance criteria

- [x] Single capabilities reject competing providers unless one authorized replacement explicitly targets the replaced owner.
- [x] Multiple capabilities retain independent dependency-first providers, reject decoration, and allow replacement of one exact contribution without changing its position.
- [x] Pipeline capabilities compose handlers by dependencies, plugin position, and registration order; replacement targets one exact handler.
- [x] Single and pipeline decorators wrap the complete capability with the earliest dependency outermost, so entry and exit order are deterministic.
- [x] Replacements require the declared replacement privilege, preserve provenance, and never inherit the replaced provider's privileges or master authority.
- [x] Replacement chains are linear and inspectable; branches, cycles, missing owners, incompatible versions, duplicate decorators, and ambiguous replacements fail before static compilation.
- [x] Declaration values are immutable before compilation; application providers receive the privilege-aware factory context, materialize only during setup, and dispose through their exact owner lifecycle.
- [x] Plugins resolve only read-only capability views permitted by their required or optional declarations; undeclared reads fail without probing installed providers.

## Tests

- [x] Runtime tests cover the complete cardinality matrix, both lifetimes, version mismatch, provider and wrapper order, exact replacement position, chains, branches, cycles, nested instances, cleanup, and application isolation.
- [x] Type and packed tests protect exact provider, decorator, consumer, and inspection types.

## Out of scope

- Schema, Typegen, or Runtime-specific capability implementations.
- Hot replacement after application compilation.
