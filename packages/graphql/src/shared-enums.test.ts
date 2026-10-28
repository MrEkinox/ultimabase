// Shared enums over GraphQL (D-150): one enum type for every field and
// function schema of its name and values, a clash of names refused at start.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { isEnumType, isInputObjectType, isObjectType } from 'graphql'
import type { Logger } from 'ultimabase'
import {
	allow,
	defineApp,
	defineEnum,
	defineFunction,
	defineModel,
	defineType,
	memory,
} from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { graphql, graphqlPlugin } from './index.ts'

const Status = defineEnum('Status', ['active', 'banned'], {
	description: 'Whether the account can sign in.',
})
const Person = defineModel({
	name: 'Person',
	use: [graphql()],
	fields: (f) => ({
		status: f.enumOf(Status, { description: 'Its own.' }),
		local: f.enumOf(['active', 'banned']),
	}),
}).with({ access: allow.public })
const Team = defineModel({
	name: 'Team',
	use: [graphql()],
	fields: (f) => ({ past: f.enumOf(Status, { list: true }) }),
}).with({ access: allow.public })
const ban = defineFunction({
	name: 'ban',
	input: z.object({ to: z.enum(['active', 'banned']).meta({ id: 'Status' }) }),
	output: z.enum(['active', 'banned']).meta({ id: 'Status' }),
	run: ({ input }) => input.to,
}).with({ access: allow.public })

const quiet: Logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => quiet,
}
async function started(
	models: Parameters<typeof defineApp>[0]['models'],
	functions: Parameters<typeof defineApp>[0]['functions'] = [],
): Promise<GraphQLSchema> {
	let schema: GraphQLSchema | undefined
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			graphqlPlugin({
				extend: (generated) => {
					schema = generated
					return generated
				},
			}),
		],
		models,
		functions,
		logger: quiet,
	})
	try {
		await app.start()
	} finally {
		await app.stop()
	}
	if (schema === undefined) throw new Error('No schema.')
	return schema
}

/** A model whose status is a shared enum named `name`. */
const named = (name: string) =>
	defineModel({
		name: 'Club',
		use: [graphql()],
		fields: (f) => ({ status: f.enumOf(defineEnum(name, ['open'])) }),
	}).with({ access: allow.public })

describe('a shared enum over GraphQL', () => {
	it('is one enum type for every field and function schema of it', async () => {
		const schema = await started([Person, Team], [ban])
		const status = schema.getType('Status')
		expect(isEnumType(status) && status.description).toBe(
			'Whether the account can sign in.',
		)
		expect(
			isEnumType(status) && status.getValues().map(({ name }) => name),
		).toEqual(['active', 'banned'])
		const person = schema.getType('Person')
		const team = schema.getType('Team')
		if (!isObjectType(person) || !isObjectType(team))
			throw new Error('No type.')
		expect(person.getFields()['status']?.type.toString()).toBe('Status!')
		expect(person.getFields()['status']?.description).toBe('Its own.')
		expect(person.getFields()['local']?.type.toString()).toBe('PersonLocal!')
		expect(team.getFields()['past']?.type.toString()).toBe('[Status!]!')
		const where = schema.getType('PersonWhereInput')
		if (!isInputObjectType(where)) throw new Error('No input.')
		expect(where.getFields()['status']?.type.toString()).toBe('StatusFilter')
		expect(schema.getType('PersonStatus')).toBeUndefined()
		const banned = schema.getMutationType()?.getFields()['ban']
		expect(banned?.type.toString()).toBe('Status!')
		expect(banned?.args[0]?.type.toString()).toBe('Status!')
	})

	it('is refused at start when one name has two value lists', async () => {
		const Other = defineEnum('Status', ['active'])
		const Club = defineModel({
			name: 'Club',
			use: [graphql()],
			fields: (f) => ({ status: f.enumOf(Other) }),
		}).with({ access: allow.public })
		await expect(started([Person, Club])).rejects.toThrow(
			'Person.status and Club.status give the type Status two shapes; name each once.',
		)
	})

	it('is refused at start when another type has its name', async () => {
		await expect(started([Person, named('Person')])).rejects.toThrow(
			'Club.status: the type Person is named like a model.',
		)
		await expect(started([named('PersonWhereInput'), Person])).rejects.toThrow(
			"Club.status: the type PersonWhereInput is a generated type's name.",
		)
		const Count = defineType({ name: 'Status', fields: { n: z.number() } })
		const count = defineFunction({
			name: 'count',
			query: true,
			output: Count,
			run: () => ({ n: 0 }),
		}).with({ access: allow.public })
		await expect(started([Person], [count])).rejects.toThrow(
			'give the type Status two shapes; name each once.',
		)
		const Shape = z.object({ n: z.number() }).meta({ id: 'Status' })
		const shape = defineFunction({
			name: 'shape',
			query: true,
			output: Shape,
			run: () => ({ n: 0 }),
		}).with({ access: allow.public })
		await expect(started([Person], [shape])).rejects.toThrow(
			'give the type Status two shapes; name each once.',
		)
	})
})
