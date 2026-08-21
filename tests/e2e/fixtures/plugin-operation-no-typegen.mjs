import process from 'node:process'

import {
	addSchemaField,
	RequestContext,
	PluginError,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	definePlugin,
	defineSchemaOption,
	operationHandler,
	operationTransportBinding,
	operationWireCodec,
	provideCapability,
	provideOperationHandler,
	provideOperationTransportBinding,
	stringField,
} from '@ultimabase/core'
import {
	FakePublicOperationTransport,
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'

const immutable = (value) => Object.freeze(value)
const input = defineOperationValue((value, path) => {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof value.message !== 'string'
	) {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutable({ message: value.message })
})
const result = defineOperationValue((value, path) => {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof value.echo !== 'string'
	) {
		throw new TypeError(`${path}.echo must be a string`)
	}
	return immutable({ echo: value.echo })
})
const inspect = defineOperation({
	errors: ['fixture.javascript.rejected'],
	input,
	name: 'fixture.javascript.inspect',
	result,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})
const inspectSchema = defineOperation({
	input,
	name: 'fixture.javascript.inspect-schema',
	result,
	target: 'schema',
	transaction: 'required',
	version: '1.0.0',
})
const inspectModel = defineOperation({
	input,
	name: 'fixture.javascript.inspect-model',
	result,
	target: 'model',
	transaction: 'required',
	version: '1.0.0',
})
const opaqueDocumentOption = defineSchemaOption({
	normalize: (value, path) => {
		if (typeof value !== 'function') {
			throw new TypeError(`${path} must be a function`)
		}
		return value
	},
	protocolVersion: 1,
	typegen: {
		module: '@fixture/javascript-document-plugin',
		type: 'DocumentOption',
	},
	valueKind: 'opaque',
})
const StablePost = Schema.define({
	className: 'JavaScriptStablePost',
	document: (value) => value,
	fields: (field) => ({ title: field.string() }),
})
const DynamicPost = Schema.define({
	className: 'JavaScriptDynamicPost',
	fields: (field) => ({ title: field.string() }),
})
const protocol = defineOperationTransport({
	name: 'fixture.javascript.fake',
	version: '1.0.0',
})
const handler = operationHandler({
	operation: inspect,
	execute: ({ input: value }) => {
		if (value.message === 'reject') {
			throw new PluginError(
				'fixture.javascript.rejected',
				'internal JavaScript diagnostic',
				{
					internalDetails: { secret: 'hidden' },
					publicMessage: 'Rejected by JavaScript fixture.',
				},
			)
		}
		return immutable({ echo: value.message })
	},
})
const schemaHandler = operationHandler({
	operation: inspectSchema,
	execute: ({ input: value, target }) =>
		immutable({
			echo: `${target.kind}:${target.kind === 'schema' ? target.schema.className : 'invalid'}:${value.message}`,
		}),
})
const modelHandler = operationHandler({
	operation: inspectModel,
	execute: ({ input: value, target }) =>
		immutable({
			echo: `${target.kind}:${target.kind === 'model' ? target.state : 'invalid'}:${value.message}`,
		}),
})
const codec = operationWireCodec({
	decode: (wire) => immutable({ message: wire.text }),
	encode: (value) => immutable({ text: value.echo }),
	operation: inspect,
	transport: protocol,
})
const binding = operationTransportBinding({ codec, operation: inspect })
const createOperationPlugin = () =>
	definePlugin({
		capabilities: {
			provides: [
				provideOperationHandler({
					contributionId: 'handler',
					create: () => ({ value: handler }),
				}),
				provideOperationHandler({
					contributionId: 'schema-handler',
					create: () => ({ value: schemaHandler }),
				}),
				provideOperationHandler({
					contributionId: 'model-handler',
					create: () => ({ value: modelHandler }),
				}),
				provideOperationTransportBinding({
					contributionId: 'binding',
					create: () => ({ value: binding }),
				}),
			],
		},
		core: '^0.0.0',
		declare: ({ models, operations, schemas }) => {
			schemas.defineOptions({
				contributionId: 'javascript-document-options',
				schema: { document: opaqueDocumentOption },
			})
			schemas.patch({
				operations: [
					addSchemaField({
						contributionId: 'javascript-document-state',
						field: stringField(),
						name: 'documentState',
					}),
				],
				targets: schemas.select({ option: { name: 'document' } }),
			})
			schemas.add({ contributionId: 'dynamic-post', schema: DynamicPost })
			operations.declare(inspect)
			operations.declare(inspectSchema)
			operations.declare(inspectModel)
			for (const target of [StablePost, DynamicPost]) {
				models.extend(target, {
					contributionId: `surfaces:${target.className}`,
					modelCommands: { inspect: inspectModel },
					schemaCommands: { inspect: inspectSchema },
				})
			}
		},
		pluginId: 'fixture.javascript-operations',
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares the dynamic JavaScript schema.',
			},
			{
				name: 'model:extend',
				reason: 'Adds JavaScript schema and model commands.',
			},
			{ name: 'operation:declare', reason: 'Declares the JavaScript fixture.' },
			{ name: 'transport:expose', reason: 'Exposes the fake fixture binding.' },
		],
		version: '1.0.0',
	})
const transaction = {
	kind: 'database-transaction-adapter',
	execute: () => Promise.reject(new Error('Unexpected database execution')),
	prepare: () => Promise.reject(new Error('Unexpected database preparation')),
	commit: () => Promise.resolve(),
	rollback: () => Promise.resolve(),
}
const adapter = {
	capabilities: { persistencePlans: databasePersistencePlanCapability },
	kind: 'database-adapter',
	execute: () =>
		Promise.resolve({
			createdAt: '2026-08-19T00:00:00.000Z',
			id: '0198c000-0000-7000-8000-000000000020',
			title: 'JavaScript result',
			updatedAt: '2026-08-19T00:00:00.000Z',
		}),
	beginTransaction: () => Promise.resolve(transaction),
}
const createDatabasePlugin = () =>
	definePlugin({
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'adapter',
					create: () => ({ value: adapter }),
				}),
			],
		},
		core: '^0.0.0',
		pluginId: 'fixture.javascript-database',
		version: '1.0.0',
	})
const ultimabase = new UltimaBase({
	pluginPrivileges: { logger: false },
	plugins: [createDatabasePlugin(), createOperationPlugin()],
	schemas: [StablePost],
})
await ultimabase.start()

export const directResult = await ultimabase
	.operation('fixture.javascript.inspect')
	.execute({ message: 'direct' })
const stableHandle = ultimabase.schema(StablePost)
const dynamicHandle = ultimabase.schema('JavaScriptDynamicPost')
const queriedPost = await stableHandle.findOne()
export const directModelResult = await queriedPost.inspect({
	message: 'queried',
})
export const stableSchemaResult = await stableHandle.commands.inspect.execute({
	message: 'stable',
})
export const dynamicSchemaResult = await dynamicHandle.inspect.execute({
	message: 'dynamic',
})
export const modelResult = await stableHandle
	.for(new StablePost({ title: 'Draft' }))
	.command('inspect')
	.execute({ message: 'draft' })
export const inspection = {
	operations: ultimabase.application.typegenGraph.operations.map(
		({ operation }) => operation.name,
	),
	plugins: ultimabase.application.pluginPrivilegeReport.plugins.map(
		({ identity }) => identity.pluginId,
	),
	schemas: ultimabase.application.schemas
		.values()
		.map(({ className }) => className),
	selectedFields: Object.keys(StablePost.fields),
}
const exposure = ultimabase.exposeOperations({
	acknowledgeUnverifiedProtection: true,
	operations: [inspect],
	transport: protocol,
})
const fake = new FakePublicOperationTransport(exposure)
export const transportResponse = await fake.request({
	context: RequestContext.anonymous({
		requestId: 'javascript-no-typegen',
		source: 'fixture',
	}),
	input: { text: 'transport' },
	operation: inspect.name,
	version: inspect.version,
})
export const transportErrorResponse = await fake.request({
	context: RequestContext.anonymous({
		requestId: 'javascript-no-typegen-error',
		source: 'fixture',
	}),
	input: { text: 'reject' },
	operation: inspect.name,
	version: inspect.version,
})

const conformanceSuite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			schemas: [StablePost],
			subject: createOperationPlugin(),
			supportPlugins: [createDatabasePlugin()],
		}),
	expected: {
		core: '^0.0.0',
		pluginId: 'fixture.javascript-operations',
		version: '1.0.0',
	},
}).check('javascript-operation', async (context) => {
	const fixture = context.createUltimaBase()
	await fixture.ultimabase.start()
	const value = await fixture.ultimabase
		.operation('fixture.javascript.inspect')
		.execute({ message: 'conformance' })
	if (value.echo !== 'conformance') {
		throw new TypeError('JavaScript operation conformance result mismatch')
	}
})
const conformanceReport = await runPluginConformance(conformanceSuite)
export const conformanceChecks = conformanceReport.checks.map(
	({ contract }) => contract,
)

await ultimabase.dispose()
process.stdout.write(
	`${JSON.stringify({ conformanceChecks, directModelResult, directResult, dynamicSchemaResult, inspection, modelResult, stableSchemaResult, transportErrorResponse, transportResponse })}\n`,
)
