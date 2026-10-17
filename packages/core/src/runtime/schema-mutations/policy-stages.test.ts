import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it, onTestFinished } from 'vitest'

import { testDatabaseFilterOperators } from '../../../../../tooling/vitest/database-filter-operators.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type RecordingAdapterCapabilityOptions,
} from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { contributeDeclarations } from '../../plugins/plugin-contributions.js'
import { contributeSchemaMutation } from '../../plugins/plugin-command-contributions.js'
import { defineOperationValue } from '../../plugins/plugin-operations.js'
import { defineSchemaMutation } from '../../plugins/plugin-schema-mutations.js'
import { addSchemaField } from '../../plugins/schema-field-patch-operations.js'
import { plugin } from '../../plugins/plugin.js'
import { stringField } from '../../schema/index.js'
import { UltimaBase } from '../application/ultima-base.js'
import { provideRuntimeConstraint } from '../capabilities.js'
import { protectedPolicy } from '../enforcement/protected-policy.js'
import type { DatabaseRowFilterNode } from '../database/contracts.js'

// ADR-0344: plugin commands run the native policy stages: database capability
// assertions on the one-row path and one grouped readability query per
// many-row command (ADR-0306).
const noInput = defineOperationValue((value, path): undefined => {
	if (value !== undefined) throw new TypeError(`${path} must be undefined`)
	return undefined
})

let fixtureIndex = 0

const row = (id: string, title: string, shouted: string | null) => ({
	createdAt: '2026-10-17T00:00:00.000Z',
	id,
	shouted,
	title,
	updatedAt: '2026-10-17T00:00:00.000Z',
})

const shouted = (id: string, title: string): QueuedAdapterResult => {
	const previous = row(id, title, null)
	const current = row(id, title, `${title}!`)
	return {
		materializations: [{ current, kind: 'update', previous }],
		status: 'fulfilled',
		target: previous,
		value: { id, shouted: current.shouted },
	}
}

interface PolicyFixtureOptions {
	readonly capabilities?: RecordingAdapterCapabilityOptions
	/** Row filter of every policy-checked plugin command. */
	readonly commandRowFilter?: DatabaseRowFilterNode
	/** Row filter of single-row reads, which readability checks use. */
	readonly readRowFilter?: DatabaseRowFilterNode
	readonly results: readonly QueuedAdapterResult[]
}

const createPolicyFixture = async (options: PolicyFixtureOptions) => {
	fixtureIndex += 1
	const suffix = String(fixtureIndex)
	const Post = UltimaBase.Schema.define({
		className: `PolicyStagePost${suffix}`,
		fields: (field) => ({ title: field.string() }),
	})
	const shoutOne = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: noInput,
		name: `fixture.policy-stages.shout-one-${suffix}`,
		returning: 'after',
		select: { title: true },
		version: '1.0.0',
	})
	const shoutMany = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: noInput,
		name: `fixture.policy-stages.shout-many-${suffix}`,
		returning: 'after',
		select: { title: true },
		target: 'many',
		version: '1.0.0',
	})
	// Like softDeleteMany: answers the written row, checks the pre-image.
	const archiveMany = defineSchemaMutation({
		authority: 'request',
		checkReadable: 'before',
		effect: 'update',
		input: noInput,
		name: `fixture.policy-stages.archive-many-${suffix}`,
		returning: 'after',
		select: { title: true },
		target: 'many',
		version: '1.0.0',
	})
	const shout = ({
		originalItem,
	}: {
		readonly originalItem: Readonly<Record<string, unknown>>
	}) => ({ data: { shouted: `${String(originalItem.title)}!` } })
	const policies = [
		...(options.commandRowFilter === undefined
			? []
			: [
					{
						filter: options.commandRowFilter,
						operations: ['plugin-schema-mutation' as const],
					},
				]),
		...(options.readRowFilter === undefined
			? []
			: [{ filter: options.readRowFilter, operations: ['find-one' as const] }]),
	]
	const trace: string[] = []
	const adapter = new RecordingDatabaseAdapter(
		options.results,
		trace,
		options.capabilities,
	)
	const owner = plugin({
		id: `fixture.policy-stages-${suffix}`,
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeSchemaMutation({ mutation: shoutOne, resolve: shout }),
			contributeSchemaMutation({ mutation: shoutMany, resolve: shout }),
			contributeSchemaMutation({ mutation: archiveMany, resolve: shout }),
			...policies.map(({ filter, operations }, index) =>
				provideRuntimeConstraint({
					contributionId: `policy-${String(index)}`,
					create: () => ({
						value: protectedPolicy({
							operations,
							evaluate: () => ({ rowFilter: filter }),
						}),
					}),
				}),
			),
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
							contributionId: 'policy-stage-mutations',
							schemaMutations: {
								archiveMany: { mutation: archiveMany, surfaces: ['schema'] },
								shoutMany: { mutation: shoutMany, surfaces: ['schema'] },
								shoutOne: { mutation: shoutOne, surfaces: ['schema'] },
							},
						},
					)
				},
			}),
		],
	})
	const database = plugin({
		core: '^0.0.0',
		id: `fixture.policy-stages-database-${suffix}`,
		version: '1.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})
	const ultimabase = new (UltimaBase.use(database, owner))({
		logger: false,
		schemas: [Post],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const command = (name: string) =>
		Reflect.get(Post, name) as (input: unknown) => Promise<unknown>
	return {
		adapter,
		archiveMany: command('archiveMany'),
		shoutMany: command('shoutMany'),
		shoutOne: command('shoutOne'),
		trace,
	}
}

const first = '0199325a-0c00-7000-8000-000000000301'
const second = '0199325a-0c00-7000-8000-000000000302'
const visible = immutableRecord({
	field: 'title',
	kind: 'equal',
	value: 'visible',
})

describe('plugin command policy stages (ADR-0344)', () => {
	it('asserts the database capabilities of the one-row target read', async () => {
		const { string: _string, ...families } =
			testDatabaseFilterOperators.families
		void _string
		const fixture = await createPolicyFixture({
			capabilities: {
				filterOperators: immutableRecord({
					...testDatabaseFilterOperators,
					families: immutableRecord({ ...families, string: ['equal'] }),
				}),
			},
			commandRowFilter: immutableRecord({
				field: 'title',
				kind: 'starts-with',
				value: 'v',
			}),
			results: [shouted(first, 'visible')],
		})

		await expect(fixture.shoutOne({ id: first })).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicMessage: 'The request cannot be evaluated by the database.',
		})
		expect(fixture.trace).not.toContain('prepare:delete-one')
	})

	it('checks the resulting rows of a many-row command with one grouped query', async () => {
		const fixture = await createPolicyFixture({
			readRowFilter: visible,
			results: [
				{ status: 'fulfilled', value: [{ id: first }, { id: second }] },
				shouted(first, 'visible'),
				shouted(second, 'visible'),
				{ status: 'fulfilled', value: 2 },
			],
		})

		await expect(
			fixture.shoutMany({ where: {}, select: { shouted: true } }),
		).resolves.toStrictEqual([
			{ id: first, shouted: 'visible!' },
			{ id: second, shouted: 'visible!' },
		])
		expect(fixture.trace).toStrictEqual([
			'adapter:begin',
			'execute:find-many',
			'prepare:delete-one',
			'prepare:delete-one',
			'execute:delete-one',
			'execute:delete-one',
			'execute:count',
			'adapter:commit',
		])
		expect(fixture.adapter.transactions[0]?.requests.at(-1)).toMatchObject({
			operation: { kind: 'count' },
			rowFilter: {
				kind: 'and',
				expressions: [
					{ field: 'id', kind: 'in', values: [first, second] },
					visible,
				],
			},
		})
	})

	it('checks the locked pre-images of a many-row command with one grouped query', async () => {
		const fixture = await createPolicyFixture({
			readRowFilter: visible,
			results: [
				{ status: 'fulfilled', value: [{ id: first }, { id: second }] },
				shouted(first, 'visible'),
				shouted(second, 'visible'),
				// Only one of the two locked targets is readable.
				{ status: 'fulfilled', value: 1 },
			],
		})

		await expect(
			fixture.archiveMany({ where: {}, select: { title: true } }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(fixture.trace).toStrictEqual([
			'adapter:begin',
			'execute:find-many',
			'prepare:delete-one',
			'prepare:delete-one',
			'execute:count',
			'adapter:rollback',
		])
	})
})
