import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
	FrameworkError,
	MasterAuthority,
	Pointer,
	UltimaBase,
	type SchemaReference,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const ValidationApplication =
	UltimaBase.use(hooksPlugin()).use(validationPlugin())

const Owner = ValidationApplication.Schema.define({
	className: 'SinglePassValidationOwner',
	fields: (field) => ({ name: field.string({ required: true }) }),
	postgres: { table: 'single_pass_validation_owners' },
})

const labelCalls: string[] = []
type OwnerReference = SchemaReference<'SinglePassValidationOwner'>
const ownerCalls: Pointer<OwnerReference>[] = []
const scoreCalls: number[] = []
// The sequential test tightens this application rule without changing storage shape.
let maximumScore = 2

const isOwnerPointer = (value: unknown): value is Pointer<OwnerReference> =>
	Pointer.is(value) && value.schema.className === Owner.className

const labelValidator: StandardSchemaV1<string> = {
	'~standard': {
		version: 1,
		vendor: 'ultimabase-single-pass-e2e',
		validate: (value) => {
			if (typeof value !== 'string') {
				return { issues: [{ message: 'Label must be a string' }] }
			}

			labelCalls.push(value)
			return value.length === 0
				? { issues: [{ message: 'Label cannot be empty' }] }
				: { value }
		},
	},
}

const ownerValidator: StandardSchemaV1<Pointer<OwnerReference>> = {
	'~standard': {
		version: 1,
		vendor: 'ultimabase-single-pass-e2e',
		validate: (value) => {
			if (!isOwnerPointer(value)) {
				return { issues: [{ message: 'Owner pointer has the wrong target' }] }
			}

			ownerCalls.push(value)
			return { value }
		},
	},
}

const scoreValidator: StandardSchemaV1<number> = {
	'~standard': {
		version: 1,
		vendor: 'ultimabase-single-pass-e2e',
		validate: (value) => {
			if (typeof value !== 'number') {
				return { issues: [{ message: 'Score must be a number' }] }
			}

			scoreCalls.push(value)
			return value > maximumScore
				? {
						issues: [
							{ message: 'Score exceeds the current application limit' },
						],
					}
				: { value }
		},
	},
}

const Item = ValidationApplication.Schema.define({
	className: 'SinglePassValidationItem',
	fields: (field) => ({
		label: field.string({
			hooks: {
				resolveInput: ({ value }) => value.trim().toLowerCase(),
			},
			required: true,
			validation: labelValidator,
		}),
		owner: field.pointer({
			required: true,
			target: 'SinglePassValidationOwner',
			validation: ownerValidator,
		}),
		profile: field.object({
			fields: (field) => ({ name: field.string({ required: true }) }),
			required: true,
		}),
		score: field.int({ default: 1, validation: scoreValidator }),
	}),
	postgres: { table: 'single_pass_validation_items' },
})

const clearCalls = (): void => {
	labelCalls.length = 0
	ownerCalls.length = 0
	scoreCalls.length = 0
}

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('Single-pass PostgreSQL fixture is unavailable')
	}

	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'single_pass' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe(
	'single-pass field validation with PostgreSQL',
	{ concurrent: false },
	() => {
		it('validates final mutation values once and keeps reads structural', async () => {
			maximumScore = 2
			clearCalls()
			const RuntimeApplication = ValidationApplication.use(
				postgresPlugin({
					pool: getFixture().pool,
					schemaPolicy: 'override',
				}),
			)
			const ultimabase = new RuntimeApplication({
				masterAuthority: new MasterAuthority({
					keys: [{ id: 'single-pass-validation-e2e', value: 'server-only' }],
					onUse: () => undefined,
				}),
				schemas: [Owner, Item],
			})
			await ultimabase.start()

			try {
				const owner = await Owner.createOne({ data: { name: 'Ada' } })
				const pointer = Owner.pointer(owner.id)
				const created = await Item.createOne({
					data: {
						label: '  Pending Review  ',
						owner: { connect: owner.id },
						profile: { name: 'Ada' },
					},
				})

				expect(created).toMatchObject({ label: 'pending review', score: 1 })
				expect(labelCalls).toStrictEqual(['pending review'])
				expect(ownerCalls).toStrictEqual([pointer])
				expect(scoreCalls).toStrictEqual([1])

				clearCalls()
				const included = await Item.findOne({
					where: { id: { eq: created.id } },
					include: { owner: { select: { name: true } } },
				})

				expect(included?.owner).toBeInstanceOf(Owner)
				expect(labelCalls).toStrictEqual([])
				expect(ownerCalls).toStrictEqual([])
				expect(scoreCalls).toStrictEqual([])

				const updated = await Item.updateOne({
					where: { id: created.id },
					data: { score: { increment: 1 } },
				})

				expect(updated?.score).toBe(2)
				expect(scoreCalls).toStrictEqual([2])

				clearCalls()
				await expect(
					Item.updateOne({
						where: { id: created.id },
						data: { score: { increment: 1 } },
					}),
				).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
				expect(scoreCalls).toStrictEqual([3])

				const persisted = await getFixture().pool.query<{
					readonly label: string
					readonly score: string
				}>(
					'SELECT label, score FROM single_pass_validation_items WHERE id = $1',
					[created.id],
				)
				expect(persisted.rows).toStrictEqual([
					{ label: 'pending review', score: '2' },
				])

				clearCalls()
				await expect(
					Item.updateOne(
						{ where: { id: created.id }, data: { label: '   ' } },
						{ useMasterKey: true },
					),
				).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
				expect(labelCalls).toStrictEqual([''])

				maximumScore = 0
				clearCalls()
				const legacy = await Item.findOne({ where: { id: { eq: created.id } } })
				expect(legacy?.label).toBe('pending review')
				expect(legacy?.score).toBe(2)
				expect(labelCalls).toStrictEqual([])
				expect(ownerCalls).toStrictEqual([])
				expect(scoreCalls).toStrictEqual([])

				// PostgreSQL accepts the JSON shape; Core must still reject its invalid child.
				await getFixture().pool.query(
					`UPDATE single_pass_validation_items
				 SET profile = '{"name": 42}'::jsonb
				 WHERE id = $1`,
					[created.id],
				)
				await expect(
					Item.findOne({ where: { id: { eq: created.id } } }),
				).rejects.toBeInstanceOf(FrameworkError)
				expect(labelCalls).toStrictEqual([])
				expect(ownerCalls).toStrictEqual([])
				expect(scoreCalls).toStrictEqual([])
			} finally {
				await ultimabase.dispose()
			}
		})
	},
)
