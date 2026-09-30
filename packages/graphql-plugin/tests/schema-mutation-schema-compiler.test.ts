import { onTestFinished, describe, expect, it, vi } from 'vitest'
import {
	MasterAuthority,
	PluginError,
	Schema,
	UltimaBase,
	addSchemaField,
	contributeDeclarations,
	contributeSchemaMutation,
	databaseAdapterCapability,
	defineOperationTransport,
	defineOperationValue,
	plugin,
	defineSchemaMutation,
	provideCapability,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
	stringField,
	type DatabaseAdapter,
	type JsonValue,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { graphqlPlugin } from '../src/plugin.js'
import {
	GraphqlSchemaMutationAdapter,
	graphqlSchemaMutationId,
} from './schema-mutation.test-support.js'

const WorkflowDocument = Schema.define({
	className: 'GraphqlWorkflowDocument',
	fields: (field) => ({ title: field.string() }),
})
const archiveInput = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.reason !== 'string') {
		throw new TypeError(`${path}.reason must be a string`)
	}
	return immutableRecord({ reason: value.reason })
})
const archiveMutation = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['fixture.graphql-schema-mutation.conflict'] as const,
	input: archiveInput,
	name: 'fixture.graphql-schema-mutation.archive',
	returning: 'after',
	select: { title: true },
	version: '1.0.0',
})
const unitInput = defineOperationValue((value, path) => {
	if (value !== undefined) throw new TypeError(`${path} must be undefined`)
	return undefined
})
const sealMutation = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: unitInput,
	name: 'fixture.graphql-schema-mutation.seal',
	returning: 'after',
	version: '1.0.0',
})
const purgeMutation = defineSchemaMutation({
	authority: 'master',
	effect: 'delete',
	input: defineOperationValue((value) => value),
	name: 'fixture.graphql-schema-mutation.purge',
	returning: 'before',
	version: '1.0.0',
})
const compatibleGraphqlProtocol = defineOperationTransport({
	name: 'ultimabase.graphql',
	version: '1.0.0',
})
const archiveMetadata = immutableRecord({
	input: immutableRecord({
		kind: 'non-null',
		ofType: immutableRecord({ kind: 'named', name: 'ArchiveWorkflowInput' }),
	}),
	kind: 'graphql-schema-mutation-binding',
	types: [
		{
			fields: [
				{
					name: 'reason',
					type: {
						kind: 'non-null',
						ofType: { kind: 'named', name: 'String' },
					},
				},
			],
			kind: 'input-object',
			name: 'ArchiveWorkflowInput',
		},
	],
} as const)

const createMutationPlugin = (
	trace: string[],
	decode: (value: unknown) => Readonly<{ readonly reason: string }>,
	options: {
		readonly command?: string
		readonly metadata?: JsonValue
	} = {},
) =>
	plugin({
		id: 'fixture.graphql-schema-mutation-owner',
		core: '^0.0.0',
		version: '1.0.0',
		permissions: {
			'model:extend': 'Adds workflow commands.',
			'operation:declare': 'Declares workflow mutations.',
			'persistence:rewrite': 'Persists workflow state.',
			'schema:declare': 'Adds workflow state.',
			'transport:expose': 'Binds GraphQL v1.',
		},
		contributions: [
			contributeSchemaMutation({
				bindings: [
					schemaMutationTransportBinding({
						codec: schemaMutationWireCodec({
							decode,
							mutation: archiveMutation,
							transport: compatibleGraphqlProtocol,
						}),
						metadata: options.metadata ?? archiveMetadata,
						mutation: archiveMutation,
					}),
				],
				mutation: archiveMutation,
				resolve: ({ context, input }) => {
					trace.push(`handler:${context.access.mode}:${input.reason}`)
					if (input.reason === 'conflict') {
						throw new PluginError(
							'fixture.graphql-schema-mutation.conflict',
							'private workflow conflict',
							{ publicMessage: 'The workflow state conflicted.' },
						)
					}
					return { data: { workflowState: 'archived' } }
				},
			}),
			contributeSchemaMutation({
				bindings: [
					schemaMutationTransportBinding({
						codec: schemaMutationWireCodec({
							decode: (value: unknown) => {
								unitInput.snapshot(value, 'seal.wire-input')
								return undefined
							},
							mutation: sealMutation,
							transport: compatibleGraphqlProtocol,
						}),
						metadata: {
							kind: 'graphql-schema-mutation-binding',
							types: [],
						},
						mutation: sealMutation,
					}),
				],
				mutation: sealMutation,
				resolve: () => ({ data: { workflowState: 'archived' } }),
			}),
			contributeSchemaMutation({
				bindings: [
					schemaMutationTransportBinding({
						codec: schemaMutationWireCodec({
							decode: (value: unknown) => value,
							mutation: purgeMutation,
							transport: compatibleGraphqlProtocol,
						}),
						metadata: {
							kind: 'graphql-schema-mutation-binding',
							types: [],
						},
						mutation: purgeMutation,
					}),
				],
				mutation: purgeMutation,
				resolve: () => undefined,
			}),
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.patch({
						operations: [
							addSchemaField({
								contributionId: 'workflow-state',
								field: stringField(),
								name: 'workflowState',
							}),
						],
						targets: schemas.select({
							className: WorkflowDocument.className,
						}),
					})
				},
				models: ({ models }) => {
					models.extend(WorkflowDocument, {
						contributionId: 'workflow-mutations',
						schemaMutations: {
							[options.command ?? 'archiveDocument']: {
								mutation: archiveMutation,
								surfaces: ['schema'],
							},
							purgeDocument: {
								mutation: purgeMutation,
								surfaces: ['schema'],
							},
							sealDocument: {
								mutation: sealMutation,
								surfaces: ['schema'],
							},
						},
					})
				},
			}),
		],
	})

const databasePlugin = (adapter: DatabaseAdapter) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.graphql-schema-mutation-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: adapter }),
			}),
		],
	})

const createFixture = async (
	options: {
		readonly command?: string
		readonly metadata?: JsonValue
		readonly mutations?: boolean
	} = {},
) => {
	const trace: string[] = []
	const audits: unknown[] = []
	const decode = vi.fn((value: unknown) => archiveInput.snapshot(value, 'wire'))
	const adapter = new GraphqlSchemaMutationAdapter(trace)
	const application = new (UltimaBase.use(
		databasePlugin(adapter),
		createMutationPlugin(trace, decode, options),
		graphqlPlugin({
			acknowledgeUnverifiedProtection: true,
			...(options.mutations === undefined
				? {}
				: { default: { mutations: options.mutations } }),
		}),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'graphql-schema-mutation', value: 'master-secret' }],
			onUse: (event) => {
				audits.push(event)
			},
		}),
		pluginPrivileges: { logger: false },
		schemas: [WorkflowDocument],
	})
	onTestFinished(() => application.dispose())
	await application.start()
	return {
		adapter,
		application,
		audits,
		decode,
		graphql: application.plugin('@ultimabase/graphql-plugin'),
		trace,
	}
}

describe('GraphQL schema mutation exposure', () => {
	it('generates and executes the schema-local field through Core', async () => {
		const fixture = await createFixture()
		try {
			const sdl = fixture.graphql.printSchema()
			expect(sdl).toContain(
				'archiveDocumentGraphqlWorkflowDocument(input: ArchiveDocumentGraphqlWorkflowDocumentInput!): GraphqlWorkflowDocument',
			)
			expect(sdl).toContain('data: ArchiveWorkflowInput!')
			expect(sdl).toContain('id: ID!')
			expect(sdl).not.toContain('purgeDocument')
			expect(sdl).toContain(
				'sealDocumentGraphqlWorkflowDocument(input: SealDocumentGraphqlWorkflowDocumentInput!): GraphqlWorkflowDocument',
			)
			expect(sdl).toContain(
				'input SealDocumentGraphqlWorkflowDocumentInput {\n  id: ID!\n}',
			)

			const context = fixture.application.anonymous({
				requestId: 'graphql-schema-mutation',
				source: 'ultimabase.graphql',
			}).context
			const result = await fixture.graphql.execute({
				context,
				document: `mutation Archive($id: ID!) {
					archiveDocumentGraphqlWorkflowDocument(input: {
						id: $id
						data: { reason: "obsolete" }
					}) { id title workflowState }
				}`,
				variables: { id: graphqlSchemaMutationId },
			})
			expect(result).toMatchObject({
				data: {
					archiveDocumentGraphqlWorkflowDocument: {
						id: graphqlSchemaMutationId,
						title: 'GraphQL release notes',
						workflowState: 'archived',
					},
				},
			})
			expect(fixture.trace).toStrictEqual([
				'begin',
				'prepare:delete-one',
				'handler:anonymous:obsolete',
				'execute:update-one',
				'commit',
			])
			expect(fixture.decode).toHaveBeenCalledWith({ reason: 'obsolete' })
			const unitResult = await fixture.graphql.execute({
				context,
				document: `mutation Seal($id: ID!) {
					sealDocumentGraphqlWorkflowDocument(input: { id: $id }) {
						id title workflowState
					}
				}`,
				variables: { id: graphqlSchemaMutationId },
			})
			expect(unitResult.errors).toBeUndefined()

			const master = await fixture.application
				.anonymous({
					requestId: 'graphql-schema-mutation-master',
					source: 'ultimabase.graphql',
				})
				.useMasterKey(
					fixture.application.authorizeMasterKey('master-secret'),
					'GraphQL schema mutation fixture',
				)
			const masterResult = await fixture.graphql.execute({
				context: master.context,
				document: `mutation Archive($id: ID!) {
					archiveDocumentGraphqlWorkflowDocument(input: {
						id: $id
						data: { reason: "compliance" }
					}) { id title workflowState }
				}`,
				variables: { id: graphqlSchemaMutationId },
			})
			expect(masterResult.errors).toBeUndefined()
			expect(fixture.trace).toContain('handler:master:compliance')
			expect(fixture.audits).toHaveLength(1)
		} finally {
			await fixture.application.dispose()
		}
	})

	it('keeps safe errors, cancellation, and context provenance ahead of codecs', async () => {
		const second = await createFixture()
		const foreign = second.application.anonymous({
			requestId: 'graphql-schema-mutation-foreign',
			source: 'ultimabase.graphql',
		}).context
		await second.application.dispose()
		const first = await createFixture()

		const document = `mutation Archive($id: ID!, $reason: String!) {
			archiveDocumentGraphqlWorkflowDocument(input: {
				id: $id
				data: { reason: $reason }
			}) { id }
		}`
		try {
			const context = first.application.anonymous({
				requestId: 'graphql-schema-mutation-error',
				source: 'ultimabase.graphql',
			}).context
			const rejected = await first.graphql.execute({
				context,
				document,
				variables: { id: graphqlSchemaMutationId, reason: 'conflict' },
			})
			expect(rejected.errors?.[0]).toMatchObject({
				extensions: {
					code: 'fixture.graphql-schema-mutation.conflict',
					requestId: 'graphql-schema-mutation-error',
				},
				message: 'The workflow state conflicted.',
			})
			expect(JSON.stringify(rejected)).not.toContain('private workflow')

			const before = first.decode.mock.calls.length

			await expect(
				first.graphql.execute({
					context: foreign,
					document,
					variables: { id: graphqlSchemaMutationId, reason: 'foreign' },
				}),
			).rejects.toThrow('belongs to another application')
			expect(first.decode).toHaveBeenCalledTimes(before)

			const controller = new AbortController()
			const cancelled = first.application.anonymous({
				requestId: 'graphql-schema-mutation-cancelled',
				signal: controller.signal,
				source: 'ultimabase.graphql',
			}).context
			controller.abort('client disconnected')
			await expect(
				first.graphql.execute({
					context: cancelled,
					document,
					variables: { id: graphqlSchemaMutationId, reason: 'cancelled' },
				}),
			).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
			expect(first.decode).toHaveBeenCalledTimes(before)
		} finally {
			await first.application.dispose()
			await second.application.dispose()
		}
	})

	it('respects schema mutation exposure and rejects metadata and root collisions', async () => {
		const disabled = await createFixture({ mutations: false })
		try {
			expect(disabled.graphql.printSchema()).not.toContain('archiveDocument')
		} finally {
			await disabled.application.dispose()
		}

		await expect(
			createFixture({ metadata: { ...archiveMetadata, unexpected: true } }),
		).rejects.toThrow('contains unknown key')
		await expect(
			createFixture({
				metadata: {
					input: {
						className: WorkflowDocument.className,
						kind: 'schema',
					},
					kind: 'graphql-schema-mutation-binding',
					types: [],
				},
			}),
		).rejects.toThrow('unavailable as input')
		await expect(
			createFixture({
				metadata: {
					input: { kind: 'named', name: WorkflowDocument.className },
					kind: 'graphql-schema-mutation-binding',
					types: [
						{
							fields: [
								{ name: 'reason', type: { kind: 'named', name: 'String' } },
							],
							kind: 'input-object',
							name: WorkflowDocument.className,
						},
					],
				},
			}),
		).rejects.toThrow(`conflicts with schema ${WorkflowDocument.className}`)
		await expect(createFixture({ command: 'delete' })).rejects.toThrow(
			'collides with an existing field',
		)
	})
})
