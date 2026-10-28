// Descriptions in the OpenAPI document (D-150): a model's on its schema, its
// fields' on the properties of its row and inputs, a function's on its
// operation, a type's on its schema, and those a Standard Schema writes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
	allow,
	defineFunction,
	defineModel,
	defineType,
	memory,
} from 'ultimabase'
import { rest } from './index.ts'
import { at, call, started } from './test/app.ts'

const Writer = defineModel({
	name: 'Writer',
	description: 'Who writes the notes.',
	use: [rest()],
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
	use: [rest()],
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
	output: z.string(),
	run: ({ input }) => `Hello ${input.name}`,
}).with({ access: allow.public })

let document: unknown
let stop: (() => Promise<void>) | undefined
beforeAll(async () => {
	const running = await started({}, memory(), [total, greet], [Writer, Note])
	stop = async () => running.app.stop()
	document = (await call(running.url, 'GET', '/api/openapi.json')).body
})
afterAll(async () => stop?.())

const schema = (...path: readonly string[]) =>
	at(document, 'components', 'schemas', ...path)
/** Each property's description, by property. */
const propertiesOf = (name: string): { [property: string]: unknown } => {
	const properties = schema(name, 'properties')
	if (typeof properties !== 'object' || properties === null) return {}
	return Object.fromEntries(
		Object.entries(properties).map(([property, value]) => [
			property,
			at(value, 'description'),
		]),
	)
}

describe('descriptions in the OpenAPI document', () => {
	it('are on the model schema and its properties in its row and inputs', () => {
		expect(schema('Writer', 'description')).toBe('Who writes the notes.')
		expect(schema('Note', 'description')).toBeUndefined()
		expect(propertiesOf('Writer')).toMatchObject({
			id: undefined,
			name: 'As printed.',
			prefs: 'How they read.',
		})
		expect(propertiesOf('Note')).toMatchObject({
			text: undefined,
			writer: 'Its writer.',
		})
		for (const input of ['WriterCreateInput', 'WriterUpdateInput']) {
			expect(propertiesOf(input)).toMatchObject({
				name: 'As printed.',
				notes: 'What they wrote.',
				prefs: 'How they read.',
			})
		}
		expect(propertiesOf('NoteCreateInput')).toMatchObject({
			writer: 'Its writer.',
		})
	})

	it('are on a function operation and a type schema', () => {
		expect(
			at(document, 'paths', '/functions/total', 'get', 'description'),
		).toBe('Counts the notes.')
		expect(
			at(document, 'paths', '/functions/greet', 'post', 'description'),
		).toBeUndefined()
		expect(schema('Total', 'description')).toBe('What was counted.')
	})

	it('are those a Standard Schema writes', () => {
		// Without an id, a json field's schema is inline, beside its field's.
		expect(schema('Writer', 'properties', 'prefs')).toMatchObject({
			description: 'How they read.',
			anyOf: [
				{
					description: 'Reading settings.',
					properties: { dark: { description: 'A dark page.' } },
				},
				{ type: 'null' },
			],
		})
		const body = at(
			document,
			'paths',
			'/functions/greet',
			'post',
			'requestBody',
		)
		const input = at(body, 'content', 'application/json', 'schema')
		expect(at(input, 'properties', 'name', 'description')).toBe('Who to greet.')
	})
})
