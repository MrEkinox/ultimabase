import { FrameworkError, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0319: transforms, function validators, schema checks, async
// validators, changed-fields-only updates, one response for every issue,
// `updateMany` index paths and `check()`, in the generation-free form D.
const calls: string[] = []

const App = UltimaBase.use(validationPlugin())

const Event = App.Schema.define({
	className: 'ValidationRulesEvent',
	fields: (field) => ({
		title: field.string({
			required: true,
			validation: z.string().trim().min(1).max(20),
		}),
		code: field.string({
			validation: (value) => {
				calls.push(`code:${value}`)
				return (
					/^[A-Z]{3}$/u.test(value) || {
						code: 'event.code',
						message: 'Three capital letters',
					}
				)
			},
		}),
		room: field.string({
			validation: async (value) => {
				await Promise.resolve()
				return value !== 'closed' || 'This room is closed'
			},
		}),
		note: field.string({ validation: z.string().min(2).nullable() }),
		startsAt: field.int({ required: true }),
		endsAt: field.int({ required: true }),
	}),
}).with((plugins) =>
	plugins.validation(
		({ item }) =>
			item.endsAt >= item.startsAt || {
				code: 'event.range',
				message: 'Ends before it starts',
				path: ['endsAt'],
			},
	),
)

const Range = App.Schema.define({
	className: 'ValidationRulesRange',
	fields: (field) => ({
		low: field.int({ required: true }),
		high: field.int({ required: true }),
	}),
}).with((plugins) =>
	plugins.validation(
		z
			.object({ low: z.number(), high: z.number() })
			.refine(({ high, low }) => high > low, {
				message: 'high must exceed low',
				path: ['high'],
			}),
	),
)

const createApplication = (database: PostgresWorkerFixture) =>
	new (App.use(
		postgresPlugin({ pool: database.pool, schemaPolicy: 'override' }),
	))({ logger: false, schemas: [Event, Range] })

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

const readIssues = async (call: Promise<unknown>): Promise<unknown> => {
	const error: unknown = await call.then(
		() => undefined,
		(failure: unknown) => failure,
	)
	if (!(error instanceof FrameworkError) || error.code !== 'VALIDATION_ERROR') {
		throw new TypeError('Expected a validation error', { cause: error })
	}
	const details: unknown = error.publicDetails
	return typeof details === 'object' && details !== null
		? Reflect.get(details, 'issues')
		: undefined
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'validation_rules' })
	const app = createApplication(fixture)
	ultimabase = app
	try {
		await app.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

beforeEach(() => {
	calls.length = 0
})

describe('Validation rules (ADR-0319)', () => {
	it('stores the validator output', async () => {
		const event = await Event.createOne({
			data: { endsAt: 2, startsAt: 1, title: '  Launch  ' },
		})
		expect(event.title).toBe('Launch')
	})

	it('reports function and async validator issues with their codes', async () => {
		await expect(
			readIssues(
				Event.createOne({
					data: {
						code: 'abc',
						endsAt: 2,
						room: 'closed',
						startsAt: 1,
						title: 'Valid',
					},
				}),
			),
		).resolves.toStrictEqual([
			{
				code: 'event.code',
				message: 'Three capital letters',
				path: ['input', 'code'],
			},
			{
				code: 'field.validation',
				message: 'This room is closed',
				path: ['input', 'room'],
			},
		])
	})

	it('runs the schema check on the complete item, in each form', async () => {
		await expect(
			readIssues(
				Event.createOne({
					data: { endsAt: 1, startsAt: 5, title: 'Backwards' },
				}),
			),
		).resolves.toStrictEqual([
			{
				code: 'event.range',
				message: 'Ends before it starts',
				path: ['endsAt'],
			},
		])
		await expect(
			readIssues(Range.createOne({ data: { high: 1, low: 3 } })),
		).resolves.toStrictEqual([
			{
				code: 'schema.validation',
				message: 'high must exceed low',
				path: ['high'],
			},
		])
	})

	it('validates only the changed fields of an update, and the complete item', async () => {
		const event = await Event.createOne({
			data: { code: 'ABC', endsAt: 5, startsAt: 1, title: 'Update me' },
		})
		calls.length = 0
		await Event.updateOne({
			where: { id: { eq: event.id } },
			data: { title: 'Renamed' },
		})
		expect(calls).toStrictEqual([])

		await expect(
			readIssues(
				Event.updateOne({
					where: { id: { eq: event.id } },
					data: { startsAt: 9 },
				}),
			),
		).resolves.toStrictEqual([
			{
				code: 'event.range',
				message: 'Ends before it starts',
				path: ['endsAt'],
			},
		])
	})

	it('never runs a field validator for null', async () => {
		await expect(
			Event.createOne({
				data: { endsAt: 2, note: null, startsAt: 1, title: 'No note' },
			}),
		).resolves.toMatchObject({ note: null })
	})

	it("reports Core's structural issues with the plugin's in one error", async () => {
		await expect(
			readIssues(
				Event.createOne({
					// The missing title is Core's issue; the code is the plugin's.
					data: { code: 'bad', endsAt: 2, startsAt: 1 } as never,
				}),
			),
		).resolves.toStrictEqual([
			expect.objectContaining({ path: ['input', 'title'] }),
			{
				code: 'event.code',
				message: 'Three capital letters',
				path: ['input', 'code'],
			},
		])
	})

	it('names the target index in updateMany issue paths', async () => {
		const first = await Event.createOne({
			data: { endsAt: 2, startsAt: 1, title: 'First' },
		})
		const second = await Event.createOne({
			data: { endsAt: 2, startsAt: 1, title: 'Second' },
		})
		await expect(
			readIssues(
				Event.updateMany({
					data: [
						{ where: { id: { eq: first.id } }, data: { title: 'Fine' } },
						{ where: { id: { eq: second.id } }, data: { code: 'no' } },
					],
				}),
			),
		).resolves.toStrictEqual([
			{
				code: 'event.code',
				message: 'Three capital letters',
				path: [1, 'update', 0, 'code', 'value'],
			},
		])
	})

	it('checks data without writing', async () => {
		const exports = ultimabase?.plugin(validationPlugin)
		if (exports === undefined) throw new TypeError('Application not started')
		await expect(
			exports.check(Event, {
				data: { endsAt: 2, startsAt: 1, title: 'Fine' },
			}),
		).resolves.toStrictEqual({ valid: true })
		await expect(
			exports.check(Event, {
				data: { code: 'x', endsAt: 1, startsAt: 3, title: 'Checked' },
			}),
		).resolves.toStrictEqual({
			issues: [
				{
					code: 'event.code',
					message: 'Three capital letters',
					path: ['input', 'code'],
				},
				{
					code: 'event.range',
					message: 'Ends before it starts',
					path: ['endsAt'],
				},
			],
			valid: false,
		})
		await expect(
			Event.findOne({ where: { title: { eq: 'Checked' } } }),
		).resolves.toBeNull()
	})
})
