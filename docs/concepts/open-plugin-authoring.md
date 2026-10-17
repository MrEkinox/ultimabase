# Open plugin authoring

UltimaBase exposes one public kernel to official and community plugins. Static
declarations build the deterministic application graph; resource-backed
capabilities are materialized later for one application. The complete example
behind this guide is the executable
[`open-kernel-workflow.ts`](../../tests/e2e/fixtures/open-kernel-workflow.ts)
fixture.

## Declare the contract

Operations carry their input, result, target, transaction, name, and version as
one immutable token. `defineOperationValue` validates untrusted values; the
validator's return type is the operation's TypeScript contract:

```ts
const transitionInput = defineOperationValue(
	(value, path): WorkflowTransitionInput =>
		validateTransitionInput(value, path),
)
const transitionResult = defineOperationValue(
	(value, path): WorkflowTransitionResult =>
		validateTransitionResult(value, path),
)

export const publishPost = defineOperation({
	input: transitionInput,
	name: 'community.workflow.publish-post',
	result: transitionResult,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})
```

Generic operations target `application`; item-oriented commands use schema mutations. The
provider receives the validated `input`, resolved `target`, immutable request
`context`, `engine`, and exact contribution `owner`:

```ts
const publishContribution = contributeOperation({
	operation: publishPost,
	execute: async ({ context, engine, input, owner, target }) =>
		executePublish({ context, engine, input, owner, target }),
})
```

Use the contribution's `create` form when its handler owns an application-local
resource. `create` receives capability readers and returns
`{ execute, dispose? }`; Core guarantees cleanup and still owns operation
validation and Runtime execution.

## Declare schema surfaces

The declaration callback is pure, synchronous, and privilege-scoped. Its
registrars use explicit contribution IDs and retain plugin provenance:

```ts
const workflowOption = defineSchemaOption<WorkflowSchemaOption>({
	normalize: (value, path) => normalizeWorkflowOption(value, path),
	protocolVersion: 1,
})

declare: ({ schemas }) => {
	const options = schemas.defineOptions({
		contributionId: 'workflow-options',
		schema: { workflow: workflowOption },
	})

	const targets = schemas.select({
		option: { name: 'workflow' },
	})
	schemas.patch(
		patchSchemas({
			patch: schemaPatch().addField({
				contributionId: 'workflow-state',
				field: stringField({ default: 'draft' }),
				name: 'workflowState',
			}),
			targets,
		}),
	)

	return options
}
```

`schemas.add`, `schemas.claim`, `schemas.defineOptions`, `schemas.patch`, and
`schemas.select` are the registrars used here. `schemas.claim` assigns plugin
ownership to an exact class already listed
at the application root without implicitly registering it. Patches are additive
and require `schema:declare`. Returning a field-option receipt projects those
field options onto `UltimaBase.use(plugin()).Schema`; schema-level options and
patched fields project nothing (ADR-0297). A plugin types its `.with` rule
through a rules slot (`SchemaRulesHKT`), the fields it adds through a feature
key of `define` and a fields slot (`SchemaFieldsHKT`), and its commands through a
statics slot (`SchemaStaticsHKT`); `definePlugin` from `@ultimabase/plugin-kit`
writes these slots for the common cases. The receipts carry no Runtime state
and do not create a second registry. Core derives operation declarations from
owned contributions; these still require `operation:declare`.

For item-oriented updates or deletes, declare a `defineSchemaMutation` token
and attach its `schemaMutations` with `models.extend` under `model:extend`.
Core preserves the selected item's policy, locked target, and transaction.

## Build the plugin

`plugin()` declares stable manifest identity and every owned contribution in
one place. Multiple instances require distinct explicit `instanceId` values:

```ts
export const workflowPlugin = (options: WorkflowPluginOptions) =>
	plugin({
		id: 'community.workflow',
		core: '^0.0.0',
		version: '1.0.0',
		instanceId: options.instanceId,
		contributions: [publishContribution, workflowDeclaration],
	})
```

The static callback cannot read secrets, adapters, clocks, filesystem, network,
or process state. The manifest announces direct environmental behavior through
claims such as `environment:filesystem` or `environment:network`; claims are
inspectable policy because in-process JavaScript is not an operating-system
sandbox.

## Read another plugin capability

Declare requirements statically and read only those exact requirements during
materialization or setup:

```ts
const auditRequirement = requireCapability(auditCapability, '^1.0.0')

plugin({
	id: 'community.audit-consumer',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [auditRequirement],
	setup: ({ capabilities }) => {
		const audit = capabilities.get(auditRequirement)
		return { audit }
	},
})
```

The token's `compose` contract converts ordered providers into the consumer
view. A resource capability's factory receives the same exact capability
reader, not a service locator. Competing `single` providers are rejected;
`multiple` and `pipeline` providers compose in deterministic order. ADR-0259
removed generic replacement and decoration. No public string slots, named
setup registries, or generic service lookup remain.

## Configure privileges

Core derives each privilege from the contribution that uses it. A plugin
passes `permissions` reasons only to replace the generated description, and
must pass one for the critical `authority:elevate` and `storage:private`
privileges. Derived privileges are allowed by default, reported, and
cumulatively denyable:

```ts
const App = UltimaBase.use(workflowPlugin({ instanceId: 'editorial' }))
const ultimabase = new App({
	schemas: [PostSchema],
	pluginPrivileges: {
		deny: ['storage:private'],
		denyClaims: ['environment:native-code'],
		plugins: {
			'community.workflow': {
				deny: ['transport:expose'],
				instances: {
					editorial: { deny: ['authority:elevate'] },
				},
			},
		},
	},
})
```

Startup reports identity, version, derived privileges, author or generated
reasons, severity, claims, and policy result. A denied privilege prevents
every later declaration, setup, connection, Runtime, or transport
effect. The application logger (ADR-0313) writes the complete report at
`debug` and denials at `error`; `logger: false` silences it, and the detached
report remains available through `ultimabase.pluginPrivilegeReport`. Plugins
receive the same logger, prefixed with their package name, in their setup
context, start phases and capability factories.

## Use the installed surface

The installed operation token carries its exact input and result from source.
Execute the token through the application:

```ts
await ultimabase
	.operation(publishPost)
	.execute({ reason: 'Editorial approval' })
```

Schema mutations separately expose their declared schema/model methods.
JavaScript executes the same graph; names, payloads, results,
ownership, capability versions, and application lifetime are validated at Runtime.

## Adapter, transport, and community helpers

A portable plugin declares logical values and operations independently. A
database bridge contributes codecs or persistence-plan rewrites through Core's
neutral adapter contracts. A
transport bridge contributes an explicit wire codec and exposure binding.
Installing the logical plugin alone exposes neither adapter access nor a
public endpoint.

`@ultimabase/plugin-kit` removes repeated immutable declaration and composition
code without bypassing Core ownership or privilege checks. `@ultimabase/testing`
supplies public conformance suites for manifests, instances, denials,
capabilities, deterministic declarations, provenance, lifecycle cleanup, and
application isolation. The helpers do not own registries, Master authority, or
capability storage.
