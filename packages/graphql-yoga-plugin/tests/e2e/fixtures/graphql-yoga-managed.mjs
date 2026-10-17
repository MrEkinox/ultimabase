import {
	UltimaBase,
	databaseAdapterCapability,
	databaseFilterOperatorCapabilityVersion,
	databasePersistencePlanCapability,
	booleanField,
	defineOperationTransport,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from '@ultimabase/core'
import {
	addSchemaField,
	contributeDeclarations,
	contributeSchemaMutation,
	defineOperationValue,
	plugin,
	provideCapability,
	defineSchemaMutation,
} from '@ultimabase/core/plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpApplicationIdHeader, httpPlugin } from '@ultimabase/http-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { createServer } from 'node:net'
import process from 'node:process'

// A real adapter declares the filters it can compile (ADR-0301); this one only
// targets rows by id.
const adapterCapabilities = Object.freeze({
	filterOperators: Object.freeze({
		kind: 'filter-operators',
		version: databaseFilterOperatorCapabilityVersion,
		families: Object.freeze({
			uuid: Object.freeze(['equal', 'not-equal', 'in', 'not-in', 'null']),
		}),
	}),
	persistencePlans: databasePersistencePlanCapability,
})

const storedRow = Object.freeze({
	createdAt: '2026-09-10T00:00:00.000Z',
	id: '01991f00-0000-7000-8000-000000000704',
	title: 'Packed Yoga',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowArchived: false,
})

class GraphqlYogaE2eTransaction {
	kind = 'database-transaction-adapter'
	capabilities = adapterCapabilities

	prepare() {
		return Promise.resolve({
			target: storedRow,
			execute: (execution) => {
				if (execution?.operation.kind !== 'update-one') {
					throw new TypeError('Packed Yoga schema mutation expects an update')
				}
				const current = Object.freeze({
					...storedRow,
					workflowArchived: true,
				})
				return Promise.resolve({
					materializations: [
						Object.freeze({ current, kind: 'update', previous: storedRow }),
					],
					result: current,
				})
			},
		})
	}

	execute() {
		throw new TypeError('Packed Yoga schema mutation executes prepared work')
	}

	commit() {
		return Promise.resolve()
	}

	rollback() {
		return Promise.resolve()
	}
}

class GraphqlYogaE2eDatabase {
	kind = 'database-adapter'
	capabilities = adapterCapabilities

	execute(request) {
		const row = {
			id: storedRow.id,
			title: storedRow.title,
		}
		return Promise.resolve(request.operation.kind === 'find-many' ? [row] : row)
	}

	beginTransaction() {
		return Promise.resolve(new GraphqlYogaE2eTransaction())
	}
}

const databasePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-yoga-e2e-database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: new GraphqlYogaE2eDatabase() }),
		}),
	],
})

const reservePort = () =>
	new Promise((resolve, reject) => {
		const server = createServer()
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (address === null || typeof address === 'string') {
				server.close()
				reject(new TypeError('GraphQL Yoga E2E port is unavailable'))
				return
			}
			server.close((error) => {
				if (error === undefined) resolve(address.port)
				else reject(error)
			})
		})
	})

const port = await reservePort()
const archiveInput = defineOperationValue((value, path) => {
	if (value !== undefined) throw new TypeError(`${path} must be undefined`)
	return undefined
})
const archiveMutation = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: archiveInput,
	name: 'fixture.graphql-yoga.archive',
	returning: 'after',
	version: '1.0.0',
})
const graphqlProtocol = defineOperationTransport({
	name: 'ultimabase.graphql',
	version: '1.0.0',
})
const workflowPlugin = plugin({
	contributions: [
		contributeDeclarations({
			models: ({ models }) => {
				models.extend(ManagedVirtual, {
					contributionId: 'workflow-mutation',
					schemaMutations: {
						archive: { mutation: archiveMutation, surfaces: ['schema'] },
					},
				})
			},
			schema: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'workflow-archived',
							field: booleanField(),
							name: 'workflowArchived',
						}),
					],
					targets: schemas.select({ className: ManagedVirtual.className }),
				})
			},
		}),
		contributeSchemaMutation({
			bindings: [
				schemaMutationTransportBinding({
					codec: schemaMutationWireCodec({
						decode: (value) =>
							archiveInput.snapshot(value, 'archive.wire-input'),
						mutation: archiveMutation,
						transport: graphqlProtocol,
					}),
					metadata: {
						kind: 'graphql-schema-mutation-binding',
						types: [],
					},
					mutation: archiveMutation,
				}),
			],
			mutation: archiveMutation,
			resolve: () => ({ data: { workflowArchived: true } }),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.graphql-yoga-workflow',
	permissions: {
		'model:extend': 'Adds archive.',
		'operation:declare': 'Declares archive.',
		'persistence:rewrite': 'Persists archive.',
		'schema:declare': 'Adds workflow state.',
		'transport:expose': 'Binds GraphQL v1.',
	},
	version: '1.0.0',
})
const schema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: 'Query',
		fields: {
			value: { resolve: () => 'network-value', type: GraphQLString },
		},
	}),
})
const Application = UltimaBase.use(
	databasePlugin,
	workflowPlugin,
	httpPlugin({ appId: 'managed' }),
	graphqlPlugin({
		publicWrites: true,
		default: { findOne: true },
		schemas: [schema],
	}),
	graphqlYogaPlugin(),
	honoServerPlugin({ host: '127.0.0.1', port }),
)
const ManagedVirtual = Application.Schema.define({
	className: 'ManagedVirtual',
	fields: (field) => ({
		title: field.string(),
		summary: field.virtual({
			output: (output) => output.string(),
			resolve: async ({ item }) => {
				await Promise.resolve()
				return String(item.title).toUpperCase()
			},
			select: { title: true },
		}),
	}),
	// The command is exposed only when its rule names it (ADR-0325).
}).with({ graphql: { archive: true } })
const application = new Application({
	logger: false,
	schemas: [ManagedVirtual],
})

await application.start()
let body
let mutation
let status
try {
	const response = await globalThis.fetch(
		`http://127.0.0.1:${String(port)}/graphql`,
		{
			body: JSON.stringify({
				query: '{ value findOneManagedVirtual { summary } }',
			}),
			headers: {
				'Content-Type': 'application/json',
				[httpApplicationIdHeader]: 'managed',
			},
			method: 'POST',
		},
	)
	status = response.status
	body = await response.json()
	const mutationResponse = await globalThis.fetch(
		`http://127.0.0.1:${String(port)}/graphql`,
		{
			body: JSON.stringify({
				query:
					'mutation { archiveManagedVirtual(input: { id: "01991f00-0000-7000-8000-000000000704" }) { id title workflowArchived createdAt updatedAt } }',
			}),
			headers: {
				'Content-Type': 'application/json',
				[httpApplicationIdHeader]: 'managed',
			},
			method: 'POST',
		},
	)
	mutation = await mutationResponse.json()
} finally {
	await application.dispose()
}

let closed = false
try {
	await globalThis.fetch(`http://127.0.0.1:${String(port)}/graphql`)
} catch {
	closed = true
}

process.stdout.write(JSON.stringify({ body, closed, mutation, status }))
