import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { applicationFixture } from '../../../tests/application-fixture.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { contributeDeclarations } from '../../plugins/plugin-contributions.js'
import { contributeSchemaMutation } from '../../plugins/plugin-command-contributions.js'
import { defineOperationValue } from '../../plugins/plugin-operations.js'
import { defineSchemaMutation } from '../../plugins/plugin-schema-mutations.js'
import { addSchemaField } from '../../plugins/schema-field-patch-operations.js'
import { stringField } from '../../schema/index.js'
import { plugin } from '../../plugins/plugin.js'
import { defineOperationTransport } from '../plugin-operations/capabilities.js'
import { UltimaBase } from '../application/ultima-base.js'
import { provideRuntimeConstraint } from '../capabilities.js'
import { protectedPolicy } from '../enforcement/protected-policy.js'
import {
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from './transport-capabilities.js'

const noInput = defineOperationValue((value, path): undefined => {
	if (value !== undefined) throw new TypeError(`${path} must be undefined`)
	return undefined
})

let fixtureIndex = 0

const row = (id: string, title: string, shouted: string | null) => ({
	createdAt: '2026-09-10T00:00:00.000Z',
	id,
	shouted,
	title,
	updatedAt: '2026-09-10T00:00:00.000Z',
})

const written = (id: string, title: string): QueuedAdapterResult => {
	const previous = row(id, title, null)
	const current = row(id, title, `${title}!`)
	return {
		materializations: [{ current, kind: 'update', previous }],
		status: 'fulfilled',
		target: previous,
		value: { id, shouted: current.shouted },
	}
}

/** One schema with a many-row `shoutMany` command, on a recording adapter. */
const createManyFixture = async (options: {
	readonly protectedRowFilter?: boolean
	readonly refusedTitle?: string
	readonly results: readonly QueuedAdapterResult[]
}) => {
	fixtureIndex += 1
	const Label = UltimaBase.Schema.define({
		className: `ManyRowLabel${String(fixtureIndex)}`,
		fields: (field) => ({ name: field.string() }),
	})
	const Post = UltimaBase.Schema.define({
		className: `ManyRowPost${String(fixtureIndex)}`,
		fields: (field) => ({
			labels: field.relation({ target: () => Label }),
			title: field.string(),
		}),
	})
	const shoutMany = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: noInput,
		name: `fixture.many-row.shout-${String(fixtureIndex)}`,
		returning: 'after',
		select: { title: true },
		target: 'many',
		version: '1.0.0',
	})
	const handler = vi.fn(
		({
			originalItem,
		}: {
			readonly originalItem: Readonly<Record<string, unknown>>
		}) => {
			if (originalItem.title === options.refusedTitle) {
				throw new TypeError('shout refused')
			}
			// `null` clears the optional owned field, as in update data.
			return {
				data: {
					shouted:
						originalItem.title === 'quiet'
							? null
							: `${String(originalItem.title)}!`,
				},
			}
		},
	)
	const trace: string[] = []
	const adapter = new RecordingDatabaseAdapter(options.results, trace)
	const owner = plugin({
		id: `fixture.many-row-${String(fixtureIndex)}`,
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeSchemaMutation({ mutation: shoutMany, resolve: handler }),
			...(options.protectedRowFilter === true
				? [
						provideRuntimeConstraint({
							contributionId: 'many-row-policy',
							create: () => ({
								value: protectedPolicy({
									operations: ['plugin-schema-mutation'],
									evaluate: () => ({
										rowFilter: immutableRecord({
											field: 'title',
											kind: 'equal',
											value: 'visible',
										}),
									}),
								}),
							}),
						}),
					]
				: []),
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.patch({
						operations: [
							addSchemaField({
								contributionId: 'shouted',
								field: stringField(),
								name: 'shouted',
							}),
						],
						targets: schemas.select({ className: Post.className }),
					})
				},
				models: ({ models }) => {
					models.extend(
						{ className: Post.className },
						{
							contributionId: 'many-row-mutations',
							schemaMutations: {
								shoutMany: { mutation: shoutMany, surfaces: ['schema'] },
							},
						},
					)
				},
			}),
		],
	})
	const database = plugin({
		core: '^0.0.0',
		id: `fixture.many-row-database-${String(fixtureIndex)}`,
		version: '1.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})
	const ultimabase = applicationFixture(
		new (UltimaBase.use(database, owner))({
			logger: false,
			schemas: [Post, Label],
		}),
	)
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const shout = Reflect.get(Post, 'shoutMany') as (
		input: unknown,
	) => Promise<unknown>
	return { adapter, handler, shout, shoutMany, trace }
}

const first = '0199325a-0c00-7000-8000-000000000201'
const second = '0199325a-0c00-7000-8000-000000000202'

describe('many-row plugin schema mutations (ADR-0316)', () => {
	it('writes every row matching where with the one-row pipeline in one transaction', async () => {
		const fixture = await createManyFixture({
			results: [
				// The targeting read returns rows in any order; ids are sorted.
				{
					status: 'fulfilled',
					value: [{ id: second }, { id: first }],
				},
				written(first, 'a'),
				written(second, 'b'),
			],
		})

		await expect(
			fixture.shout({
				where: { title: { startsWith: 'a' } },
				select: { shouted: true },
			}),
		).resolves.toStrictEqual([
			{ id: first, shouted: 'a!' },
			{ id: second, shouted: 'b!' },
		])
		expect(fixture.handler).toHaveBeenCalledTimes(2)
		// Every row is locked before the first one is written (ADR-0344).
		expect(fixture.trace).toStrictEqual([
			'adapter:begin',
			'execute:find-many',
			'prepare:delete-one',
			'prepare:delete-one',
			'execute:delete-one',
			'execute:delete-one',
			'adapter:commit',
		])
		const targeting = fixture.adapter.transactions[0]?.requests[0]
		expect(targeting?.operation).toMatchObject({
			kind: 'find-many',
			query: {
				selection: { fields: [{ field: 'id', kind: 'selected-field' }] },
				where: {
					expression: { field: 'title', kind: 'starts-with', value: 'a' },
				},
			},
		})
	})

	it('targets only the rows the enforced row constraints allow', async () => {
		const fixture = await createManyFixture({
			protectedRowFilter: true,
			results: [{ status: 'fulfilled', value: [] }],
		})

		await expect(fixture.shout({ where: {} })).resolves.toStrictEqual([])
		expect(fixture.handler).not.toHaveBeenCalled()
		expect(fixture.adapter.transactions[0]?.requests[0]).toMatchObject({
			operation: { kind: 'find-many' },
			rowFilter: { field: 'title', kind: 'equal', value: 'visible' },
		})
	})

	it('rolls every row back when one row cannot be written', async () => {
		const fixture = await createManyFixture({
			refusedTitle: 'b',
			results: [
				{ status: 'fulfilled', value: [{ id: first }, { id: second }] },
				written(first, 'a'),
				written(second, 'b'),
			],
		})

		await expect(
			fixture.shout({ where: {}, select: { shouted: true } }),
		).rejects.toThrow('handler failed.')
		expect(fixture.handler).toHaveBeenCalledTimes(2)
		expect(fixture.trace.at(-1)).toBe('adapter:rollback')
		expect(fixture.trace).not.toContain('adapter:commit')
	})

	it('requires a where and rejects one-row input', async () => {
		const fixture = await createManyFixture({ results: [] })

		await expect(fixture.shout({ id: first })).rejects.toThrow(
			'contains unknown key: id',
		)
		await expect(fixture.shout({})).rejects.toThrow('requires where')
		await expect(fixture.shout({ where: { nope: { eq: 1 } } })).rejects.toThrow(
			TypeError,
		)
		expect(fixture.trace).toStrictEqual([])
	})

	it('rejects a relation in the result selection before the transaction', async () => {
		const fixture = await createManyFixture({ results: [] })

		await expect(
			fixture.shout({ where: {}, select: { labels: true } }),
		).rejects.toThrow(
			new TypeError(
				'selection.labels must not reference a relation; read relations through include',
			),
		)
		expect(fixture.trace).toStrictEqual([])
	})

	it('has no transport binding until commands take input', async () => {
		const { shoutMany } = await createManyFixture({ results: [] })
		const transport = defineOperationTransport({
			name: 'fixture.transport',
			version: '1.0.0',
		})

		expect(() =>
			schemaMutationTransportBinding({
				codec: schemaMutationWireCodec({
					decode: (value: unknown): undefined => {
						if (isPlainRecord(value)) return undefined
						return undefined
					},
					mutation: shoutMany,
					transport,
				}),
				mutation: shoutMany,
			}),
		).toThrow('many-row schema mutations cannot be bound to a transport yet')
	})

	it('clears an optional owned field when the effect writes null', async () => {
		const previous = row(first, 'quiet', 'loud')
		const current = row(first, 'quiet', null)
		const fixture = await createManyFixture({
			results: [
				{ status: 'fulfilled', value: [{ id: first }] },
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: { id: first, shouted: null },
				},
			],
		})

		await expect(
			fixture.shout({ where: {}, select: { shouted: true } }),
		).resolves.toStrictEqual([{ id: first, shouted: null }])
		expect(fixture.adapter.transactions[0]?.executions[0]).toMatchObject({
			operation: {
				kind: 'update-one',
				update: {
					operations: [{ field: 'shouted', kind: 'set', value: null }],
				},
			},
		})
	})
})
