// Deprecated over GraphQL (D-216): `@deprecated(reason:)` on a field in the
// model's types and inputs, on a virtual field, and on a function's field.
import { httpPlugin } from '@ultimabase/http'
import type {
	GraphQLField,
	GraphQLInputField,
	GraphQLNamedType,
	GraphQLSchema,
} from 'graphql'
import { isInputObjectType, isObjectType, printSchema } from 'graphql'
import type { Logger } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	memory,
} from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { graphql, graphqlPlugin } from './index.ts'

const Person = defineModel({
	name: 'Person',
	use: [graphql()],
	fields: (f) => ({
		displayName: f.string(),
		name: f.string({ optional: true, deprecated: 'Use displayName.' }),
		rank: f.number({
			default: 0,
			description: 'Its place.',
			deprecated: 'Use order.',
		}),
		pets: f.many(() => Pet, { inverse: 'owner', deprecated: 'Use animals.' }),
		shout: f.virtual(z.string(), {
			needs: ['displayName'],
			deprecated: 'Upper-case it.',
		}),
	}),
}).with({
	access: allow.public,
	virtuals: {
		shout: { run: ({ record }) => record.displayName.toUpperCase() },
	},
})
const Pet = defineModel({
	name: 'Pet',
	use: [graphql()],
	fields: (f) => ({
		owner: f.one(() => Person, { optional: true, deprecated: 'Use keeper.' }),
	}),
}).with({ access: allow.public })

const legacySearch = defineFunction({
	name: 'legacySearch',
	deprecated: 'Use search.',
	query: true,
	output: z.number(),
	run: () => 0,
}).with({ access: allow.public })
const legacyReset = defineFunction({
	name: 'legacyReset',
	deprecated: 'Use reset.',
	run: () => {},
}).with({ access: allow.public })

let schema: GraphQLSchema | undefined
const quiet: Logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => quiet,
}
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
	models: [Person, Pet],
	functions: [legacySearch, legacyReset],
	logger: quiet,
})
beforeAll(async () => app.start())
afterAll(async () => app.stop())

const typeOf = (name: string): GraphQLNamedType => {
	const type = schema?.getType(name)
	if (type === undefined) throw new Error(`No type ${name}.`)
	return type
}
/** Each deprecated field's reason, by field. */
const reasonsOf = (name: string): { [field: string]: unknown } => {
	const type = typeOf(name)
	if (!isObjectType(type) && !isInputObjectType(type)) return {}
	const fields: {
		[field: string]: GraphQLField<unknown, unknown> | GraphQLInputField
	} = type.getFields()
	return Object.fromEntries(
		Object.entries(fields)
			.filter(([, field]) => field.deprecationReason != null)
			.map(([field, { deprecationReason }]) => [field, deprecationReason]),
	)
}

const person = {
	name: 'Use displayName.',
	rank: 'Use order.',
	pets: 'Use animals.',
}

describe('deprecated over GraphQL', () => {
	it('is on the model types, a virtual field and the inputs', () => {
		expect(reasonsOf('Person')).toStrictEqual({
			...person,
			shout: 'Upper-case it.',
		})
		const { pets: _, ...scalars } = person
		expect(reasonsOf('DeletedPerson')).toStrictEqual(scalars)
		for (const input of [
			'PersonWhereInput',
			'PersonOrderByInput',
			'PersonCreateInput',
			'PersonUpdateInput',
		]) {
			expect(reasonsOf(input)).toStrictEqual(person)
		}
		expect(reasonsOf('PetWhereInput')).toStrictEqual({ owner: 'Use keeper.' })
		expect(reasonsOf('PetCreateInput')).toStrictEqual({ owner: 'Use keeper.' })
	})

	it('keeps the description', () => {
		const type = typeOf('Person')
		expect(isObjectType(type) && type.getFields()['rank']).toMatchObject({
			description: 'Its place.',
			deprecationReason: 'Use order.',
		})
	})

	it('is on a function’s query or mutation', () => {
		if (schema === undefined) throw new Error('No schema.')
		const printed = printSchema(schema)
		expect(printed).toContain(
			'legacySearch: Float! @deprecated(reason: "Use search.")',
		)
		expect(
			schema?.getMutationType()?.getFields()['legacyReset']?.deprecationReason,
		).toBe('Use reset.')
		expect(printed).toContain(
			'name: String @deprecated(reason: "Use displayName.")',
		)
	})
})
