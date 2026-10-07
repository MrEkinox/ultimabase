import { describe, expect, it, vi } from 'vitest'

import { applicationFixture } from '../../../tests/application-fixture.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import { prepareSchemaMutationEnvelope } from '../../application/schema-mutation-envelope.js'
import {
	defineOperationValue,
	plugin as createPlugin,
	contributeDeclarations,
	contributeSchemaMutation,
	defineSchemaMutation,
} from '../../foundation.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { normalizeOperationOptions } from '../../query/operations/execution.js'

import { UltimaBase } from '../application/ultima-base.js'
import {
	readUltimaBaseEngine,
	readUltimaBaseKernel,
} from '../application/ultima-base-kernel.js'
import { executeRequestSchemaMutation } from './request-execution.js'
import { defineOperationTransport } from '../plugin-operations/capabilities.js'
import {
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from './transport-capabilities.js'
import { planApplicationSchemaMutations } from '../application/schema-mutation-transport-planning.js'
import { exposeFrameworkSchemaMutations } from './transport-exposure.js'

const protocol = defineOperationTransport({
	name: 'fixture.canonical-mutation.wire',
	version: '1.0.0',
})

const Post = UltimaBase.Schema.define({
	className: 'CanonicalMutationPost',
	fields: (field) => ({ title: field.string() }),
})
const Other = UltimaBase.Schema.define({
	className: 'CanonicalMutationOther',
	fields: (field) => ({ title: field.string() }),
})
const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue((value, path): undefined => {
		if (value !== undefined) throw new TypeError(`${path} must be undefined`)
		return undefined
	}),
	name: 'fixture.canonical-mutation.archive',
	returning: 'after',
	version: '1.0.0',
})

describe('canonical mutation request identity', () => {
	it('checks exact commands and schema-local aliases before target lookup without legacy surfaces', async () => {
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', target: null, value: null }],
			trace,
		)
		const resolve = vi.fn(() => ({ data: {} }))
		const owner = createPlugin({
			id: 'fixture.canonical-mutation.owner',
			core: '^0.0.0',
			version: '1.0.0',
			permissions: {
				'transport:expose': 'Checks the payload boundary over a wire facade.',
				'operation:declare': 'Declares the mutation fixture.',
				'model:extend': 'Selects different aliases per schema.',
				'persistence:rewrite': 'Owns the mutation effect.',
			},
			contributions: [
				contributeSchemaMutation({
					bindings: [
						schemaMutationTransportBinding({
							mutation: archive,
							codec: schemaMutationWireCodec({
								mutation: archive,
								transport: protocol,
								decode: (value: undefined) => value,
							}),
						}),
					],
					mutation: archive,
					resolve,
				}),
				contributeDeclarations({
					models: ({ models }) => {
						models.extend(Post, {
							contributionId: 'post',
							schemaMutations: {
								archive: { mutation: archive, surfaces: ['schema', 'model'] },
							},
						})
						models.extend(Other, {
							contributionId: 'other',
							schemaMutations: {
								close: { mutation: archive, surfaces: ['schema'] },
							},
						})
						return undefined
					},
				}),
			],
		})
		const database = createPlugin({
			id: 'fixture.canonical-mutation.database',
			core: '^0.0.0',
			version: '1.0.0',
			contributions: [provideTestDatabaseAdapter(adapter)],
		})
		const ultimabase = applicationFixture(
			new (UltimaBase.use(database, owner))({
				schemas: [Post, Other],
				pluginPrivileges: { logger: false },
			}),
		)
		await ultimabase.start()
		const graph = readApplicationKernelState(
			readUltimaBaseKernel(ultimabase),
		).commands
		const command = graph.fromSource(archive)
		if (command?.kind !== 'mutation')
			throw new Error('Missing mutation fixture')
		const id = '0199325a-0c00-7000-8000-000000000301'
		const envelope = prepareSchemaMutationEnvelope({
			graph,
			command,
			schema: Post,
			name: 'archive',
			id,
			input: undefined,
			projection: {},
		})
		const engine = ultimabase.anonymous({
			requestId: 'canonical-mutation',
			source: 'fixture',
		})
		const options = normalizeOperationOptions(undefined)

		// Runtime must use compiled target membership, even if the public view is unavailable.
		const legacy = vi
			.spyOn(FrameworkApplication.prototype, 'getSchemaSurface')
			.mockImplementation(() => {
				throw new Error('Legacy surface lookup reached Runtime')
			})
		try {
			const exposure = exposeFrameworkSchemaMutations(
				readUltimaBaseEngine(ultimabase),
				{
					transport: protocol,
					acknowledgeUnverifiedProtection: true,
				},
			)
			const binding = exposure.mutations.find(
				(item) => item.schema === Post.className,
			)
			if (binding === undefined) throw new Error('Missing wire fixture')

			const plan = planApplicationSchemaMutations(graph, {
				transport: protocol,
			})
			expect(exposure.mutations).toEqual(plan.mutations)
			expect(
				plan.mutations.map(({ schema, command }) => [schema, command]),
			).toEqual([
				[Post.className, 'archive'],
				[Other.className, 'close'],
			])
			expect(
				exposure.mutations.every(
					(item, index) => item === plan.mutations[index],
				),
			).toBe(true)
			await expect(
				exposure.execute({
					binding: { ...binding },
					context: engine.context,
					id,
					input: undefined,
					schema: Post,
				}),
			).rejects.toMatchObject({ code: 'PLUGIN_OPERATION_INVALID' })
			for (const [candidate, schema, request] of [
				[{ ...command }, Post, envelope],
				[command, Post, { ...envelope, command: 'close' }],
				[
					command,
					Other,
					prepareSchemaMutationEnvelope({
						graph,
						command,
						schema: Other,
						name: 'archive',
						id,
						input: undefined,
						projection: {},
					}),
				],
				[command, Post, { ...envelope, mutation: { ...command.definition } }],
			] as const) {
				await expect(
					executeRequestSchemaMutation(
						engine,
						candidate,
						schema,
						request,
						options,
					),
				).rejects.toMatchObject({
					internalDetails: { kind: 'schema-mutation-envelope-mismatch' },
				})
			}
			const readProjection = vi.fn(() => {
				throw new Error('Projection was read before payload validation')
			})
			await expect(
				exposure.execute({
					binding,
					context: engine.context,
					id,
					input: 'invalid',
					schema: Post,
					get select(): unknown {
						return readProjection()
					},
				}),
			).rejects.toThrow(`${archive.name}.input must be undefined`)
			expect(readProjection).not.toHaveBeenCalled()
			expect(trace).toEqual([])
			await expect(
				executeRequestSchemaMutation(engine, command, Post, envelope, options),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
			expect(trace).toEqual([
				'adapter:begin',
				'prepare:delete-one',
				'adapter:rollback',
			])
			expect(resolve).not.toHaveBeenCalled()
			expect(legacy).not.toHaveBeenCalled()
		} finally {
			legacy.mockRestore()
			await ultimabase.dispose()
		}
	})
})
