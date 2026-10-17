import { UltimaBase } from '@ultimabase/core'
import { anonymous, plugin } from '@ultimabase/core/plugin'
import { defineOperation } from '@ultimabase/plugin-kit'
import { describe, expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'

import { graphqlPlugin } from '../src/index.js'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

const databasePlugin = testDatabasePlugin(
	new ScriptedTestDatabase({ description: 'Operation fixture' }),
	{ id: 'fixture.graphql-operation-types-database' },
)

// Nested objects, an enum, lists, a nullable value and a free-form record.
const planTrip = defineOperation({
	name: 'planTrip',
	input: z.object({
		title: z.string().min(3),
		priority: z.enum(['low', 'high']),
		stops: z.array(
			z.object({ city: z.string(), nights: z.number().int().optional() }),
		),
		note: z.string().nullable(),
		meta: z.record(z.string(), z.unknown()),
	}),
	output: z.object({
		id: z.string(),
		nights: z.number().int(),
		cities: z.array(z.string()),
		summary: z.object({ title: z.string(), priority: z.enum(['low', 'high']) }),
		note: z.string().nullable(),
		meta: z.record(z.string(), z.unknown()),
	}),
	handler: ({ input }) => ({
		cities: input.stops.map(({ city }) => city),
		id: 'trip-1',
		meta: input.meta,
		nights: input.stops.reduce((sum, { nights = 1 }) => sum + nights, 0),
		note: input.note,
		summary: { priority: input.priority, title: input.title },
	}),
})
const ping = defineOperation({
	name: 'ping',
	input: z.null(),
	output: z.literal('pong'),
	handler: () => 'pong' as const,
})

const start = async () => {
	const application = new (UltimaBase.use(
		databasePlugin,
		planTrip,
		ping,
		graphqlPlugin(),
	))({ logger: false, schemas: [] })
	onTestFinished(() => application.dispose())
	await application.start()
	const graphql = application.plugin('@ultimabase/graphql-plugin')
	const execute = (document: string, variables?: Record<string, unknown>) =>
		graphql.execute({
			context: anonymous(application, {
				requestId: 'graphql-operation-types',
				source: 'ultimabase.graphql',
			}).context,
			document,
			...(variables === undefined ? {} : { variables }),
		})
	return { execute, sdl: graphql.printSchema() }
}

describe('typed public operations (ADR-0325, 6.6c amendment)', () => {
	it('derives GraphQL types from the operation validators', async () => {
		const { sdl } = await start()

		expect(sdl).toContain('planTrip(input: PlanTripInput!): PlanTripResult!')
		// A null input takes no argument; a string literal is a String.
		expect(sdl).toContain('ping: String!')
		expect(sdl).toContain(`input PlanTripInput {
  meta: JSON
  note: String
  priority: PlanTripInputPriority!
  stops: [PlanTripInputStops!]!
  title: String!
}`)
		expect(sdl).toContain(`input PlanTripInputStops {
  city: String!
  nights: SafeInt
}`)
		expect(sdl).toContain(`enum PlanTripInputPriority {
  high
  low
}`)
		expect(sdl).toContain(`type PlanTripResult {
  cities: [String!]!
  id: String!
  meta: JSON
  nights: SafeInt!
  note: String
  summary: PlanTripResultSummary!
}`)
		expect(sdl).toContain(`type PlanTripResultSummary {
  priority: PlanTripResultSummaryPriority!
  title: String!
}`)
	})

	it('executes through the operation and returns its typed result', async () => {
		const { execute } = await start()

		const result = await execute(
			`mutation Plan($input: PlanTripInput!) {
				planTrip(input: $input) {
					id nights cities note meta summary { title priority }
				}
			}`,
			{
				input: {
					meta: { budget: 3 },
					note: null,
					priority: 'high',
					stops: [{ city: 'Lyon', nights: 2 }, { city: 'Nice' }],
					title: 'Summer',
				},
			},
		)
		expect(result).toEqual({
			data: {
				planTrip: {
					cities: ['Lyon', 'Nice'],
					id: 'trip-1',
					meta: { budget: 3 },
					nights: 3,
					note: null,
					summary: { priority: 'high', title: 'Summer' },
				},
			},
		})
		expect(await execute('mutation { ping }')).toEqual({
			data: { ping: 'pong' },
		})
	})

	it('reports the validator issues as a VALIDATION_ERROR', async () => {
		const { execute } = await start()

		const result = await execute(
			`mutation {
				planTrip(input: {
					meta: {}, note: "n", priority: low, stops: [], title: "ab"
				}) { id }
			}`,
		)
		expect(result.errors?.[0]).toMatchObject({
			extensions: {
				code: 'VALIDATION_ERROR',
				details: {
					issues: [{ code: 'operation.input', path: ['input', 'title'] }],
				},
			},
		})
		// GraphQL itself refuses a value outside the enum before the operation.
		const invalid = await execute(
			`mutation {
				planTrip(input: {
					meta: {}, note: null, priority: urgent, stops: [], title: "abc"
				}) { id }
			}`,
		)
		expect(invalid.errors?.[0]?.message).toContain('PlanTripInputPriority')
	})
})
