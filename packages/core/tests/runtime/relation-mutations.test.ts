import {
	databaseAdapterServiceToken,
	definePlugin,
	MasterAuthority,
	Schema,
	UltimaBase,
	type Pointer,
} from '../../src/index.js'
import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { RecordingDatabaseAdapter } from './fixtures/recording-database-adapter.js'
import {
	RelationAuthor,
	RelationPost,
} from '../../src/schema/fields/builtins/relation-fixture.test-support.js'

const sourceId = '0198f090-2a50-7000-8000-000000000101'
const targetId = '0198f090-2a50-7000-8000-000000000102'
const fixtureInstant = '2026-08-04T00:00:00.000Z'

interface RelationRuntimeFixtureOptions {
	readonly allowUpdate?: boolean
	readonly adapterError?: Error
	readonly requiredAccessMode?: 'anonymous' | 'master'
	readonly relationCapability?: boolean
	readonly targetMissing?: boolean
	readonly targetPreflight?: boolean
}

/** Creates isolated schemas so Access closures never leak between concurrent tests. */
const createRelationRuntimeFixture = async (
	options: RelationRuntimeFixtureOptions = {},
) => {
	const accessModes: ('anonymous' | 'master')[] = []
	const trace: string[] = []
	const Target = Schema.define({
		className: 'RelationMutationTarget',
		fields: (field) => ({ label: field.string() }),
	})
	const Source = Schema.define({
		className: 'RelationMutationSource',
		fields: (field) => ({
			name: field.string(),
			targets: field.relation({
				access: {
					write: ({ context, change }) => {
						accessModes.push(context.access.mode)
						trace.push(
							`access:${change.action}:${String(change.targets.length)}`,
						)
						return options.requiredAccessMode === undefined
							? (options.allowUpdate ?? true)
							: context.access.mode === options.requiredAccessMode
					},
				},
				target: 'RelationMutationTarget',
			}),
		}),
		hooks: {
			beforeOperation: {
				update: ({ operation }) => {
					for (const candidate of operation.update.operations) {
						if (candidate.kind === 'relation') {
							trace.push(`before:${candidate.value.action}`)
						}
					}
				},
			},
			afterOperation: {
				update: ({ operation }) => {
					for (const candidate of operation.update.operations) {
						if (candidate.kind === 'relation') {
							trace.push(`after:${candidate.value.action}`)
						}
					}
				},
			},
		},
	})
	const sourceRecord = {
		createdAt: fixtureInstant,
		id: sourceId,
		name: 'Source',
		updatedAt: fixtureInstant,
	}
	const targetRecord = {
		createdAt: fixtureInstant,
		id: targetId,
		label: 'Target',
		updatedAt: fixtureInstant,
	}
	const results = [
		{ status: 'fulfilled' as const, value: sourceRecord },
		...(options.targetPreflight === false
			? []
			: [
					{
						status: 'fulfilled' as const,
						value: options.targetMissing === true ? null : targetRecord,
					},
				]),
		options.adapterError === undefined
			? {
					materializations: [
						{
							current: sourceRecord,
							kind: 'update' as const,
							previous: sourceRecord,
						},
					],
					status: 'fulfilled' as const,
					target: sourceRecord,
					value: sourceRecord,
				}
			: {
					error: options.adapterError,
					status: 'rejected' as const,
					target: sourceRecord,
				},
	]
	const adapter = new RecordingDatabaseAdapter(
		results,
		trace,
		{},
		{
			...(options.relationCapability === undefined
				? {}
				: { relations: options.relationCapability }),
		},
	)
	const database = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.relation-mutation-database',
		setup: ({ services }) => {
			services.provide(databaseAdapterServiceToken, adapter)
		},
		slot: 'database-adapter',
	})
	const ultimabase = new UltimaBase({
		...(options.requiredAccessMode === 'master'
			? {
					// Master relation tests retain the same audited authority contract as production.
					masterAuthority: new MasterAuthority({
						keys: [{ id: 'relation-master', value: 'fixture-secret' }],
						onUse: () => undefined,
					}),
				}
			: {}),
		plugins: [database],
		schemas: [Source, Target],
	})

	await ultimabase.start()
	const source = await Source.findOne(
		{ where: { id: { eq: sourceId } } },
		{ ultimabase },
	)

	if (source === null) {
		throw new TypeError('Relation mutation fixture requires one source object')
	}

	return { accessModes, adapter, source, Source, Target, trace, ultimabase }
}

describe('relation mutation Runtime execution', () => {
	it('uses source update Access, hooks, and one automatic transaction', async () => {
		const fixture = await createRelationRuntimeFixture()
		const pointer = fixture.Target.pointer(targetId)

		await fixture.source.relation('targets').connect(pointer, {
			ultimabase: fixture.ultimabase,
		})

		const transaction = fixture.adapter.transactions[0]
		const request = transaction?.requests[1]

		expect(request?.operation.kind).toBe('update-one')
		expect(request?.rowFilter).toBeDefined()
		expect(JSON.stringify(request?.operation)).not.toContain(sourceId)
		if (
			request?.operation.kind !== 'update-one' ||
			!('update' in request.operation) ||
			!isPlainRecord(request.operation.update) ||
			!Array.isArray(request.operation.update.operations)
		) {
			throw new TypeError('Expected one normalized relation update')
		}
		expect(request.operation.update.operations[0]).toMatchObject({
			field: 'targets',
			kind: 'relation',
			value: { action: 'connect', targets: [pointer] },
		})
		expect(fixture.trace).toStrictEqual([
			'execute:find-one',
			'adapter:begin',
			'execute:find-one',
			'access:connect:1',
			'prepare:update-one',
			'before:connect',
			'execute:update-one',
			'after:connect',
			'adapter:commit',
		])

		await fixture.ultimabase.dispose()
	})

	it('executes replace and clear through the same source update lifecycle', async () => {
		for (const action of ['set', 'clear'] as const) {
			const fixture = await createRelationRuntimeFixture({
				targetPreflight: action === 'set',
			})
			const relation = fixture.source.relation('targets')

			if (action === 'set') {
				await relation.set([fixture.Target.pointer(targetId)], {
					ultimabase: fixture.ultimabase,
				})
			} else {
				await relation.clear({ ultimabase: fixture.ultimabase })
			}

			const requests = fixture.adapter.transactions[0]?.requests
			const sourceUpdate = requests?.at(-1)?.operation

			if (
				sourceUpdate?.kind !== 'update-one' ||
				!('update' in sourceUpdate) ||
				!isPlainRecord(sourceUpdate.update) ||
				!Array.isArray(sourceUpdate.update.operations)
			) {
				throw new TypeError('Expected one normalized relation update')
			}

			expect(sourceUpdate.update.operations[0]).toMatchObject({
				kind: 'relation',
				value: { action },
			})
			expect(fixture.trace).toContain(`after:${action}`)
			expect(fixture.trace.at(-1)).toBe('adapter:commit')
			await fixture.ultimabase.dispose()
		}
	})

	it('propagates trusted master authority through relation Access and hooks', async () => {
		const fixture = await createRelationRuntimeFixture({
			requiredAccessMode: 'master',
			targetPreflight: false,
		})

		await fixture.source.relation('targets').clear({
			ultimabase: fixture.ultimabase,
			useMasterKey: true,
		})

		expect(fixture.accessModes).toStrictEqual(['master'])
		expect(fixture.trace).toContain('after:clear')
		expect(fixture.trace.at(-1)).toBe('adapter:commit')
		await fixture.ultimabase.dispose()
	})

	it('rolls back adapter failures after source Access and before hooks', async () => {
		const adapterError = new Error('relation write failed')
		const fixture = await createRelationRuntimeFixture({ adapterError })

		await expect(
			fixture.source
				.relation('targets')
				.connect(fixture.Target.pointer(targetId), {
					ultimabase: fixture.ultimabase,
				}),
		).rejects.toBe(adapterError)
		expect(fixture.trace).toStrictEqual([
			'execute:find-one',
			'adapter:begin',
			'execute:find-one',
			'access:connect:1',
			'prepare:update-one',
			'before:connect',
			'execute:update-one',
			'adapter:rollback',
		])

		await fixture.ultimabase.dispose()
	})

	it('hides source Access denial as not found and rolls back', async () => {
		const fixture = await createRelationRuntimeFixture({
			allowUpdate: false,
			targetPreflight: false,
		})

		await expect(
			fixture.source
				.relation('targets')
				.clear({ ultimabase: fixture.ultimabase }),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
		expect(fixture.trace).toStrictEqual([
			'execute:find-one',
			'adapter:begin',
			'access:clear:0',
			'adapter:rollback',
		])

		await fixture.ultimabase.dispose()
	})

	it('rejects forged pointer values before opening a transaction', async () => {
		const fixture = await createRelationRuntimeFixture()
		const forged = {
			id: targetId,
			schema: fixture.Target,
		} as unknown as Pointer<typeof fixture.Target>

		await expect(
			fixture.source.relation('targets').connect(forged, {
				ultimabase: fixture.ultimabase,
			}),
		).rejects.toThrow('Relation mutation targets must contain a Pointer')
		expect(fixture.adapter.transactions).toStrictEqual([])

		await fixture.ultimabase.dispose()
	})

	it('hides a missing target and rolls back before relation storage runs', async () => {
		const fixture = await createRelationRuntimeFixture({ targetMissing: true })

		await expect(
			fixture.source
				.relation('targets')
				.connect(fixture.Target.pointer(targetId), {
					ultimabase: fixture.ultimabase,
				}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
		expect(fixture.trace).toStrictEqual([
			'execute:find-one',
			'adapter:begin',
			'execute:find-one',
			'adapter:rollback',
		])

		await fixture.ultimabase.dispose()
	})

	it('fails closed when the transaction adapter lacks relation support', async () => {
		const fixture = await createRelationRuntimeFixture({
			relationCapability: false,
		})

		await expect(
			fixture.source
				.relation('targets')
				.connect(fixture.Target.pointer(targetId), {
					ultimabase: fixture.ultimabase,
				}),
		).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
		expect(fixture.trace).toStrictEqual([
			'execute:find-one',
			'adapter:begin',
			'execute:find-one',
			'access:connect:1',
			'adapter:rollback',
		])

		await fixture.ultimabase.dispose()
	})

	it('turns inverse pointer connects into target update lifecycles', async () => {
		const trace: string[] = []
		const authorRecord = {
			createdAt: fixtureInstant,
			id: sourceId,
			updatedAt: fixtureInstant,
		}
		const sourcePointer = RelationAuthor.pointer(sourceId)
		const postRecord = {
			author: sourcePointer,
			createdAt: fixtureInstant,
			id: targetId,
			updatedAt: fixtureInstant,
		}
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: authorRecord },
				{ status: 'fulfilled', value: postRecord },
				{
					materializations: [
						{
							current: postRecord,
							kind: 'update',
							previous: postRecord,
						},
					],
					status: 'fulfilled',
					target: postRecord,
					value: postRecord,
				},
				{
					materializations: [
						{
							current: authorRecord,
							kind: 'update',
							previous: authorRecord,
						},
					],
					status: 'fulfilled',
					target: authorRecord,
					value: authorRecord,
				},
			],
			trace,
		)
		const database = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.inverse-pointer-relation-database',
			setup: ({ services }) => {
				services.provide(databaseAdapterServiceToken, adapter)
			},
			slot: 'database-adapter',
		})
		const ultimabase = new UltimaBase({
			plugins: [database],
			schemas: [RelationAuthor, RelationPost],
		})

		await ultimabase.start()
		const author = await RelationAuthor.findOne(
			{ where: { id: { eq: sourceId } } },
			{ ultimabase },
		)

		if (author === null) {
			throw new TypeError('Inverse relation fixture requires one author')
		}

		await author
			.relation('posts')
			.connect(RelationPost.pointer(targetId), { ultimabase })

		const requests = adapter.transactions[0]?.requests

		expect(requests?.map(({ operation }) => operation.kind)).toStrictEqual([
			'find-one',
			'update-one',
			'update-one',
		])
		const targetUpdate = requests?.[1]?.operation

		if (
			targetUpdate?.kind !== 'update-one' ||
			!('update' in targetUpdate) ||
			!isPlainRecord(targetUpdate.update) ||
			!Array.isArray(targetUpdate.update.operations)
		) {
			throw new TypeError('Expected one inverse pointer target update')
		}

		expect(targetUpdate.update.operations[0]).toMatchObject({
			field: 'author',
			kind: 'set',
			value: sourcePointer,
		})
		expect(trace).toStrictEqual([
			'execute:find-one',
			'adapter:begin',
			'execute:find-one',
			'prepare:update-one',
			'execute:update-one',
			'prepare:update-one',
			'execute:update-one',
			'adapter:commit',
		])

		await ultimabase.dispose()
	})
})
