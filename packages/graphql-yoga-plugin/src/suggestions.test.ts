import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { httpApplicationIdHeader, httpPlugin } from '@ultimabase/http-plugin'
import {
	GraphQLEnumType,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	type GraphQLInputFieldConfigMap,
} from 'graphql'
import { describe, expect, it, onTestFinished } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'
import {
	graphqlYogaFixtureDatabasePlugin,
	graphqlYogaFixtureHttpConsumer,
	readFixtureHttpApplication,
} from './test-application.test-support.js'

const NoteStatus = new GraphQLEnumType({
	name: 'NoteStatus',
	values: { DRAFT: {}, PUBLISHED: {} },
})

const NoteFilter: GraphQLInputObjectType = new GraphQLInputObjectType({
	name: 'NoteFilter',
	fields: (): GraphQLInputFieldConfigMap => ({
		title: { type: GraphQLString },
		status: { type: NoteStatus },
		any: { type: new GraphQLList(new GraphQLNonNull(NoteFilter)) },
	}),
})

const schema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: 'Query',
		fields: {
			greeting: { type: GraphQLString, resolve: () => 'hello' },
			notes: {
				type: GraphQLString,
				args: { filter: { type: new GraphQLNonNull(NoteFilter) } },
				resolve: () => 'notes',
			},
			byStatus: {
				type: GraphQLString,
				args: { status: { type: new GraphQLNonNull(NoteStatus) } },
				resolve: () => 'notes',
			},
		},
	}),
})

/** Posts one failing GraphQL request with the given introspection setting. */
const post = async (
	introspection: boolean,
	body: Readonly<{
		query: string
		variables?: Readonly<Record<string, unknown>>
	}>,
): Promise<unknown> => {
	const ultimabase = new (UltimaBase.use(
		graphqlYogaFixtureDatabasePlugin,
		httpPlugin({ appId: 'notes' }),
		graphqlPlugin({ default: false, schemas: [schema] }),
		graphqlYogaPlugin({ introspection }),
		graphqlYogaFixtureHttpConsumer,
	))({ logger: false, schemas: [] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const response = await readFixtureHttpApplication(ultimabase).fetch({
		originalHeaders: [[httpApplicationIdHeader, 'notes']],
		request: new Request('http://localhost/graphql', {
			body: JSON.stringify(body),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		}),
	})
	expect(response.status).toBe(400)
	const result: unknown = await response.json()
	return result
}

/** Sends `{ greetin }`, one letter short of `greeting`, and reads its errors. */
const misspelledField = (introspection: boolean): Promise<unknown> =>
	post(introspection, { query: '{ greetin }' })

const filterQuery = 'query ($filter: NoteFilter!) { notes(filter: $filter) }'

// ADR-0333, decision 4: suggestions name fields, so they follow introspection.
describe('GraphQL Yoga validation suggestions', () => {
	it('suggests field names while introspection is on', async () => {
		expect(await misspelledField(true)).toMatchObject({
			errors: [
				{
					message:
						'Cannot query field "greetin" on type "Query". Did you mean "greeting"?',
				},
			],
		})
	})

	it('names no field when introspection is off', async () => {
		expect(await misspelledField(false)).toMatchObject({
			errors: [{ message: 'Cannot query field "greetin" on type "Query".' }],
		})
	})
})

// ADR-0333 amendment: variables are coerced during execution, after validation.
describe('GraphQL Yoga variable suggestions', () => {
	const cases = [
		{
			name: 'a misspelled input field',
			body: { query: filterQuery, variables: { filter: { titel: 'x' } } },
			shown:
				'Variable "$filter" has invalid value: Expected value of type "NoteFilter" not to include unknown field "titel". Did you mean "title"? Found: { titel: "x" }.',
			hidden:
				'Variable "$filter" has invalid value: Expected value of type "NoteFilter" not to include unknown field "titel", found: { titel: "x" }.',
		},
		{
			name: 'a misspelled enum value inside an input object',
			body: { query: filterQuery, variables: { filter: { status: 'DRAF' } } },
			shown:
				'Variable "$filter" has invalid value at .status: Value "DRAF" does not exist in "NoteStatus" enum. Did you mean the enum value "DRAFT"?',
			hidden:
				'Variable "$filter" has invalid value at .status: Value "DRAF" does not exist in "NoteStatus" enum.',
		},
		{
			name: 'a misspelled input field nested in a list',
			body: {
				query: filterQuery,
				variables: { filter: { any: [{ statsu: 'DRAFT' }] } },
			},
			shown:
				'Variable "$filter" has invalid value at .any[0]: Expected value of type "NoteFilter" not to include unknown field "statsu". Did you mean "status"? Found: { statsu: "DRAFT" }.',
			hidden:
				'Variable "$filter" has invalid value at .any[0]: Expected value of type "NoteFilter" not to include unknown field "statsu", found: { statsu: "DRAFT" }.',
		},
		{
			name: 'a misspelled enum variable',
			body: {
				query: 'query ($status: NoteStatus!) { byStatus(status: $status) }',
				variables: { status: 'DRAF' },
			},
			shown:
				'Variable "$status" has invalid value: Value "DRAF" does not exist in "NoteStatus" enum. Did you mean the enum value "DRAFT"?',
			hidden:
				'Variable "$status" has invalid value: Value "DRAF" does not exist in "NoteStatus" enum.',
		},
	] as const

	for (const { name, body, shown, hidden } of cases) {
		it(`suggests for ${name} while introspection is on`, async () => {
			expect(await post(true, body)).toMatchObject({
				errors: [{ message: shown, extensions: { code: 'BAD_USER_INPUT' } }],
			})
		})

		it(`names nothing for ${name} when introspection is off`, async () => {
			expect(await post(false, body)).toMatchObject({
				errors: [{ message: hidden, extensions: { code: 'BAD_USER_INPUT' } }],
			})
		})
	}
})
