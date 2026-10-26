// The inputs' checks and JSON Schemas (D-113), each user field type a
// sign-up may take.
import { describe, expect, it } from 'vitest'
import type { SchemaField } from 'ultimabase'
import type { Property } from './input.ts'
import {
	fieldProperty,
	outputSchema,
	signInInput,
	signUpInput,
} from './input.ts'

type Scalar = Extract<SchemaField, { kind: 'scalar' }>

const scalar = (
	name: string,
	type: Scalar['type'],
	extra: { optional?: boolean; values?: readonly string[] } = {},
): Scalar => ({
	kind: 'scalar',
	name,
	type,
	optional: extra.optional ?? false,
	unique: false,
	...(extra.values === undefined ? {} : { values: extra.values }),
})

const fields = new Map<string, Property>(
	[
		scalar('name', 'string'),
		scalar('age', 'number', { optional: true }),
		scalar('admin', 'boolean', { optional: true }),
		scalar('born', 'date', { optional: true }),
		scalar('role', 'enum', { optional: true, values: ['reader', 'writer'] }),
		scalar('tags', 'stringList'),
	].map((field) => [
		field.name,
		fieldProperty(
			field,
			!field.optional && field.type !== 'stringList',
			'test',
		),
	]),
)
const signUp = signUpInput(fields)['~standard']
const base = {
	email: 'ada@example.com',
	password: 'correct horse',
	name: 'Ada',
}

describe('a sign-up input', () => {
	it('reads each field, and dates from a string or a Date', () => {
		const born = new Date('1815-12-10')
		const read = signUp.validate({
			input: {
				...base,
				age: 36,
				admin: false,
				born: born.toISOString(),
				role: 'writer',
				tags: ['ts'],
			},
		})
		expect(read).toStrictEqual({
			value: {
				input: {
					...base,
					age: 36,
					admin: false,
					born,
					role: 'writer',
					tags: ['ts'],
				},
			},
		})
		expect(signUp.validate({ input: { ...base, born } })).toStrictEqual({
			value: { input: { ...base, born } },
		})
	})

	it('takes null for an optional field, and nothing for a missing one', () => {
		const empty = { age: null, admin: null, born: null, role: null }
		expect(signUp.validate({ input: { ...base, ...empty } })).toStrictEqual({
			value: { input: { ...base, ...empty } },
		})
		expect(signUp.validate({ input: { ...base, name: null } })).toMatchObject({
			issues: [{ path: ['input', 'name'], message: 'Expected a string.' }],
		})
	})

	it('reports every issue with its path', () => {
		const read = signUp.validate({
			input: {
				email: 3,
				password: 'x',
				age: Number.NaN,
				admin: 'yes',
				born: 'never',
				role: 'owner',
				tags: ['ts', ''],
				extra: true,
			},
		})
		expect(read).toStrictEqual({
			issues: [
				{ path: ['input', 'extra'], message: 'Unknown field.' },
				{ path: ['input', 'email'], message: 'Expected a string.' },
				{
					path: ['input', 'password'],
					message: 'A password has 8 to 256 characters.',
				},
				{ path: ['input', 'name'], message: 'Required.' },
				{ path: ['input', 'age'], message: 'Expected a number.' },
				{ path: ['input', 'admin'], message: 'Expected a boolean.' },
				{ path: ['input', 'born'], message: 'Expected a date.' },
				{ path: ['input', 'role'], message: 'Expected one of reader, writer.' },
				{
					path: ['input', 'tags'],
					message: 'Expected a list of non-empty strings.',
				},
			],
		})
		expect(signUp.validate({ input: { ...base, tags: 'ts' } })).toMatchObject({
			issues: [{ message: 'Expected a list of non-empty strings.' }],
		})
		expect(signUp.validate({ input: { ...base, born: 0 } })).toMatchObject({
			issues: [{ message: 'Expected a date.' }],
		})
		expect(signUp.validate({ input: { ...base, password: 3 } })).toMatchObject({
			issues: [{ message: 'Expected a string.' }],
		})
	})

	it('refuses a root or an input that is not an object', () => {
		expect(signUp.validate('x')).toMatchObject({
			issues: [
				{ path: ['input'], message: 'Expected an object.' },
				{ path: [], message: 'Expected an object.' },
			],
		})
		expect(signInInput['~standard'].validate({ input: [] })).toStrictEqual({
			issues: [{ path: ['input'], message: 'Expected an object.' }],
		})
	})

	it('exports a JSON Schema whose input is the named object', () => {
		const json = signUp.jsonSchema.input()
		expect(json).toStrictEqual(signUp.jsonSchema.output())
		expect(json).toMatchObject({
			properties: { input: { $ref: '#/$defs/SignUp' } },
			required: ['input'],
			$defs: {
				SignUp: {
					required: ['email', 'password', 'name'],
					additionalProperties: false,
					properties: {
						email: { type: 'string', format: 'email' },
						name: { type: 'string' },
						age: { type: ['number', 'null'] },
						born: { type: ['string', 'null'], format: 'date-time' },
						role: {
							type: ['string', 'null'],
							enum: ['reader', 'writer', null],
						},
						tags: { type: 'array', items: { type: 'string', minLength: 1 } },
					},
				},
			},
		})
		const required = fieldProperty(
			scalar('role', 'enum', { values: ['a'] }),
			true,
			'test',
		)
		expect(required.json).toStrictEqual({ type: 'string', enum: ['a'] })
	})
})

it('an output schema passes its value through', () => {
	const output = outputSchema<string>({ type: 'string' })['~standard']
	expect(output.validate('x')).toStrictEqual({ value: 'x' })
	expect(output.jsonSchema.output()).toStrictEqual({ type: 'string' })
})
