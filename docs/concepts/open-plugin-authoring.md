# Open plugin authoring

UltimaBase exposes one public kernel to official and community plugins. Static
declarations build the deterministic application graph; resource-backed
capabilities are materialized later for one application. The complete example
behind this guide is the executable
[`open-kernel-workflow.ts`](../../tests/e2e/fixtures/open-kernel-workflow.ts)
fixture.

## Declare the contract

Operations carry their input, result, target, transaction, name, and version as
one immutable token. `defineOperationValue` validates untrusted values, while a
Typegen reference names the public TypeScript type without copying executable
code into generated output:

```ts
const transitionInputReference = defineTypegenReference({
	exportName: 'WorkflowTransitionInput',
	module: '@community/workflow-plugin',
})
const transitionResultReference = defineTypegenReference({
	exportName: 'WorkflowTransitionResult',
	module: '@community/workflow-plugin',
})

const transitionInput = defineOperationValue(
	(value, path) => validateTransitionInput(value, path),
	transitionInputReference,
)
const transitionResult = defineOperationValue(
	(value, path) => validateTransitionResult(value, path),
	transitionResultReference,
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
`context`, `engine`, capability `adapters`, and exact contribution `owner`:

```ts
const publishContribution = contributeOperation({
	operation: publishPost,
	execute: async ({ adapters, context, engine, input, owner, target }) =>
		executePublish({ adapters, context, engine, input, owner, target }),
})
```

Use the contribution's `create` form when its handler owns an application-local
resource. `create` receives capability readers and returns
`{ execute, dispose? }`; Core guarantees cleanup and still owns operation
validation and Runtime execution.

## Declare schema and model surfaces

The declaration callback is pure, synchronous, and privilege-scoped. Its
registrars use explicit contribution IDs and retain plugin provenance:

```ts
const workflowOption = defineSchemaOption<WorkflowSchemaOption>({
	normalize: (value, path) => normalizeWorkflowOption(value, path),
	protocolVersion: 1,
	typegen: {
		module: '@community/workflow-plugin',
		type: 'WorkflowSchemaOption',
	},
})

declare: ({ schemas }) => {
	schemas.defineOptions({
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
}
```

`schemas.add`, `schemas.claim`, `schemas.defineOptions`, `schemas.patch`, and
`schemas.select` are the registrars used here. `schemas.claim` assigns plugin
ownership to an exact class already listed
at the application root without implicitly registering it. Patches are additive
and require `schema:declare`. Core derives operation declarations and reachable
Typegen references from owned contributions; these still require
`operation:declare` and `typegen:reference`. Typegen derives declarations from
the graph, without a manual output registry.

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
		permissions: {
			'schema:declare': 'Adds workflow options and fields.',
			'operation:declare': 'Declares the publish operation.',
			'typegen:reference': 'References public workflow types.',
		},
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

Requested privileges are allowed by default, reported, and cumulatively
denyable:

```ts
const Application = UltimaBase.use(workflowPlugin({ instanceId: 'editorial' }))
const ultimabase = new Application({
	schemas: [PostSchema],
	pluginPrivileges: {
		deny: ['adapter:raw'],
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

Startup reports identity, version, requested privileges, reasons, severity,
claims, and policy result. A denied active privilege prevents every later
declaration, Typegen, setup, connection, Runtime, or transport effect. Supply
`pluginPrivileges.logger: false` for explicit silence or an `{ info, error }`
logger; the detached report remains available through
`ultimabase.application.pluginPrivilegeReport`.

## Use the installed surface

Typegen derives the application operation's exact input and result from its
owned references. Execute the installed token through the application:

```ts
await ultimabase
	.operation(publishPost)
	.execute({ reason: 'Editorial approval' })
```

Schema mutations separately expose their declared schema/model methods.
JavaScript executes the same graph without Typegen; names, payloads, results,
ownership, capability versions, and application lifetime are validated at Runtime.

## Adapter, transport, and community helpers

A portable plugin declares logical values and operations independently. A
database bridge contributes codecs, constraints, persistence plans, or physical
schema metadata through versioned adapter capabilities. A
transport bridge contributes an explicit wire codec and exposure binding.
Installing the logical plugin alone exposes neither raw adapter access nor a
public endpoint.

`@ultimabase/plugin-kit` removes repeated immutable declaration and composition
code without bypassing Core ownership or privilege checks. `@ultimabase/testing`
supplies public conformance suites for manifests, instances, denials,
capabilities, deterministic declarations, provenance, lifecycle cleanup, and
application isolation. The helpers do not own registries, Master authority, or
capability storage.
