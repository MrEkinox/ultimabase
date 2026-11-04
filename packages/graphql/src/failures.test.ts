// What fails on the server (D-227): an invalid schema refuses the start, an
// error the handler throws is the HTTP plugin's, logged with its id, and a
// value graphql-js cannot send is the server's error (D-106).
import {
	GraphQLInputObjectType,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
} from 'graphql'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { allow, defineFunction } from 'ultimabase'
import { at, post, started } from './test/app.ts'

const broken = vi.hoisted(() => ({ executor: false }))
vi.mock(import('graphql'), async (original) => {
	const graphql = await original()
	return {
		...graphql,
		executeRootSelectionSet: (
			...args: Parameters<typeof graphql.executeRootSelectionSet>
		): ReturnType<typeof graphql.executeRootSelectionSet> => {
			if (broken.executor) throw new Error('The executor broke.')
			return graphql.executeRootSelectionSet(...args)
		},
	}
})

it('refuses to start with an invalid schema', async () => {
	const empty = new GraphQLInputObjectType({ name: 'Empty', fields: {} })
	const invalid = new GraphQLSchema({
		query: new GraphQLObjectType({
			name: 'Query',
			fields: {
				echo: { type: GraphQLString, args: { input: { type: empty } } },
			},
		}),
	})
	await expect(started({ extend: () => invalid })).rejects.toThrow(
		'graphqlPlugin: the schema is invalid. Input Object type Empty must define one or more fields.',
	)
})

it('logs an error the handler throws, and masks it', async () => {
	const { app, lines, url } = await started()
	broken.executor = true
	const response = await fetch(`${url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ __typename }' }),
	})
	broken.executor = false
	await app.stop()
	const body: unknown = await response.json()
	expect(response.status).toBe(500)
	expect(at(body, 'code')).toBe('INTERNAL')
	const logged = lines.find(({ level }) => level === 'error')
	expect(at(logged?.first, 'correlationId')).toBe(at(body, 'correlationId'))
	expect(at(logged?.first, 'err', 'message')).toBe('The executor broke.')
})

it('masks and logs a value its type cannot send', async () => {
	// Above 2³¹, which a GraphQL Int cannot hold.
	const big = defineFunction({
		name: 'big',
		query: true,
		output: z.number().int(),
		run: () => 3_000_000_000,
	}).with({ access: allow.public })
	const { app, lines, url } = await started({}, undefined, [], [big])
	const correlationId: unknown = expect.any(String)
	const result = await post(`${url}/graphql`, '{ big }')
	await app.stop()
	expect(result.errors).toEqual([
		expect.objectContaining({
			message: 'Internal error.',
			extensions: { code: 'INTERNAL', correlationId },
		}),
	])
	const logged = lines.find(({ level }) => level === 'error')
	expect(at(logged?.first, 'correlationId')).toBe(
		at(result.errors, 0, 'extensions', 'correlationId'),
	)
	expect(at(logged?.first, 'err', 'message')).toBe(
		'Int cannot represent non 32-bit signed integer value: 3000000000',
	)
})
