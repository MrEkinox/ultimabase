// Descriptions over GraphQL (D-150): a model's, its fields' in its type and
// inputs, a function's and a type's, and those a Standard Schema writes.
import { httpPlugin } from '@ultimabase/http'
import type {
	GraphQLField,
	GraphQLInputField,
	GraphQLNamedType,
	GraphQLSchema,
} from 'graphql'
import { isEnumType, isInputObjectType, isObjectType } from 'graphql'
import type { Logger } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	defineType,
	memory,
} from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { graphql, graphqlPlugin } from './index.ts'

const Writer = defineModel({
	name: 'Writer',
	description: 'Who writes the notes.',
	use: [graphql()],
	fields: (f) => ({
		name: f.string({ description: 'As printed.' }),
		notes: f.many(() => Note, { description: 'What they wrote.' }),
		prefs: f.json({
			optional: true,
			description: 'How they read.',
			validate: z
				.object({ dark: z.boolean().describe('A dark page.') })
				.describe('Reading settings.'),
		}),
	}),
}).with({ access: allow.public })
const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({
		text: f.string(),
		writer: f.one(() => Writer, { description: 'Its writer.' }),
	}),
}).with({ access: allow.public })

const Total = defineType({
	name: 'Total',
	description: 'What was counted.',
	fields: { notes: z.number() },
})
const total = defineFunction({
	name: 'total',
	description: 'Counts the notes.',
	query: true,
	output: Total,
	run: () => ({ notes: 0 }),
}).with({ access: allow.public })
const greet = defineFunction({
	name: 'greet',
	input: z.object({ name: z.string().describe('Who to greet.') }),
	output: z
		.object({
			text: z.string().describe('The greeting.'),
			tone: z.enum(['warm', 'dry']).describe('How it sounds.'),
		})
		.describe('A greeting.'),
	run: ({ input }) => ({ text: `Hello ${input.name}`, tone: 'warm' as const }),
}).with({ access: allow.public })
const echo = defineFunction({
	name: 'echo',
	input: z.string().describe('What to repeat.'),
	output: z.string(),
	run: ({ input }) => input,
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
	models: [Writer, Note],
	functions: [total, greet, echo],
	logger: quiet,
})
beforeAll(async () => app.start())
afterAll(async () => app.stop())

const typeOf = (name: string): GraphQLNamedType => {
	const type = schema?.getType(name)
	if (type === undefined) throw new Error(`No type ${name}.`)
	return type
}
/** Each field's description, by field. */
const fieldsOf = (name: string): { [field: string]: unknown } => {
	const type = typeOf(name)
	if (!isObjectType(type) && !isInputObjectType(type)) return {}
	const fields: {
		[field: string]: GraphQLField<unknown, unknown> | GraphQLInputField
	} = type.getFields()
	return Object.fromEntries(
		Object.entries(fields).map(([field, { description }]) => [
			field,
			description,
		]),
	)
}
const root = (name: 'Query' | 'Mutation', field: string) =>
	schema?.getRootType(name === 'Query' ? 'query' : 'mutation')?.getFields()[
		field
	]

describe('descriptions over GraphQL', () => {
	it('are on the model type and its fields there and in its inputs', () => {
		expect(typeOf('Writer').description).toBe('Who writes the notes.')
		expect(typeOf('Note').description).toBeUndefined()
		expect(fieldsOf('Writer')).toMatchObject({
			id: undefined,
			name: 'As printed.',
			notes: 'What they wrote.',
			prefs: 'How they read.',
		})
		expect(fieldsOf('Note')).toMatchObject({
			text: undefined,
			writer: 'Its writer.',
		})
		expect(fieldsOf('DeletedWriter')).toMatchObject({ name: 'As printed.' })
		for (const input of ['WriterCreateInput', 'WriterUpdateInput']) {
			expect(fieldsOf(input)).toMatchObject({
				name: 'As printed.',
				notes: 'What they wrote.',
				prefs: 'How they read.',
			})
		}
		expect(fieldsOf('NoteCreateInput')).toMatchObject({
			writer: 'Its writer.',
		})
	})

	it('are on a function and a type', () => {
		expect(root('Query', 'total')?.description).toBe('Counts the notes.')
		expect(typeOf('Total').description).toBe('What was counted.')
		expect(root('Mutation', 'greet')?.description).toBeUndefined()
	})

	it('are those a Standard Schema writes', () => {
		const greeted = root('Mutation', 'greet')
		expect(
			greeted?.args.map(({ name, description }) => [name, description]),
		).toEqual([['name', 'Who to greet.']])
		expect(typeOf('GreetOutput').description).toBe('A greeting.')
		expect(fieldsOf('GreetOutput')).toEqual({
			text: 'The greeting.',
			tone: 'How it sounds.',
		})
		const tone = typeOf('GreetOutputTone')
		expect(isEnumType(tone) && tone.description).toBe('How it sounds.')
		expect(root('Mutation', 'echo')?.args[0]?.description).toBe(
			'What to repeat.',
		)
		expect(typeOf('WriterPrefs').description).toBe('Reading settings.')
		expect(fieldsOf('WriterPrefs')).toEqual({ dark: 'A dark page.' })
		expect(fieldsOf('WriterPrefsInput')).toEqual({ dark: 'A dark page.' })
	})
})
