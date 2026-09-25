import process from 'node:process'

import {
	addSchemaField,
	RequestContext,
	PluginError,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	contributeOperation,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	definePlugin,
	defineSchemaOption,
	operationTransportBinding,
	operationWireCodec,
	provideCapability,
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
const codec = operationWireCodec({
	decode: (wire) => immutable({ message: wire.text }),
	encode: (value) => immutable({ text: value.echo }),
	operation: inspect,
	transport: protocol,
})
const binding = operationTransportBinding({ codec, operation: inspect })
const createOperationPlugin = () =>
	definePlugin({
		core: '^0.0.0',
		declare: ({ schemas }) => {
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
		},
		operations: [
			contributeOperation({
				bindings: [binding],
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
				operation: inspect,
			}),
		],
		pluginId: 'fixture.javascript-operations',
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares the dynamic JavaScript schema.',
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
		capabilities: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'adapter',
				create: () => ({ value: adapter }),
			}),
		],
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
// Native schema/model handles remain usable in JavaScript without generated types.
export const nativeResults = {
	title: queriedPost.title,
	dynamicSchema: dynamicHandle.schema.className,
	draftState: stableHandle.for(new StablePost({ title: 'Draft' })).state,
	persistedState: stableHandle.for(queriedPost).state,
}
export const inspection = {
	// Inspection is descriptive even when the source token retains executable validators.
	callbackFree: ultimabase.application.typegenGraph.operations.every(
		({ operation }) =>
			!('snapshot' in operation.input) && !('snapshot' in operation.result),
	),
	constructorFree: ultimabase.application.typegenGraph.schemaSurfaces.every(
		({ schema }) =>
			typeof schema === 'object' && Object.keys(schema).join() === 'className',
	),
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
await ultimabase.dispose()
const conformanceReport = await runPluginConformance(conformanceSuite)
export const conformanceChecks = conformanceReport.checks.map(
	({ contract }) => contract,
)

process.stdout.write(
	`${JSON.stringify({ conformanceChecks, directResult, nativeResults, inspection, transportErrorResponse, transportResponse })}\n`,
)
