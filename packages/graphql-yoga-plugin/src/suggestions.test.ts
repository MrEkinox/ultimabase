import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { httpApplicationIdHeader, httpPlugin } from '@ultimabase/http-plugin'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { describe, expect, it, onTestFinished } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'
import {
	graphqlYogaFixtureDatabasePlugin,
	graphqlYogaFixtureHttpConsumer,
	readFixtureHttpApplication,
} from './test-application.test-support.js'

const schema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: 'Query',
		fields: {
			greeting: { type: GraphQLString, resolve: () => 'hello' },
		},
	}),
})

/** Sends `{ greetin }`, one letter short of `greeting`, and reads its errors. */
const misspelledField = async (introspection: boolean): Promise<unknown> => {
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
			body: JSON.stringify({ query: '{ greetin }' }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		}),
	})
	expect(response.status).toBe(400)
	const body: unknown = await response.json()
	return body
}

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
