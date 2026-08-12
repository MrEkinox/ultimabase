import { describe, expect, it } from 'vitest'

import { compileValidationPlans, Schema } from '../index.js'
import {
	getSchemaAccessDeclarations,
	normalizeSchemaAccessDeclarations,
} from './declarations.js'

const createSchema = (access?: object) =>
	Schema.define({
		className: 'AccessArticle',
		fields: (field) => ({
			title: field.string({ validation: { required: true } }),
		}),
		// Tests deliberately cross the untrusted JavaScript declaration boundary.
		...(access === undefined ? {} : { access }),
	})

describe('schema Access declarations', () => {
	it('copies and freezes sparse rules without exposing them as metadata', () => {
		const deleteRule = () => true
		const source: { delete?: typeof deleteRule } = { delete: deleteRule }
		const schema = createSchema(source)
		const declarations = getSchemaAccessDeclarations(schema)

		source.delete = () => false

		expect(declarations?.operation?.delete).toBe(deleteRule)
		expect(Object.isFrozen(declarations)).toBe(true)
		expect(Object.isFrozen(declarations?.operation)).toBe(true)
		expect(Reflect.set(declarations ?? {}, 'operation', {})).toBe(false)
		expect(Object.keys(schema)).toStrictEqual([
			'definition',
			'className',
			'constraints',
			'fields',
			'indexes',
			'extensions',
			'provenance',
		])
		expect(schema).not.toHaveProperty('access')
	})

	it('copies complete schema read branches without executing callbacks', () => {
		let calls = 0
		const one = () => {
			calls += 1

			return true
		}
		const read = { count: false, exists: true, many: true, one }
		const schema = createSchema({ read: { allow: read } })
		const declarations = getSchemaAccessDeclarations(schema)

		read.one = () => false

		expect(declarations?.operation?.read).toStrictEqual({
			count: false,
			exists: true,
			many: true,
			one,
		})
		expect(Object.isFrozen(declarations?.operation?.read)).toBe(true)
		expect(calls).toBe(0)
	})

	it('retains booleans and synchronous or asynchronous callbacks verbatim', () => {
		let calls = 0
		const read = () => true
		const update = (): Promise<boolean> => {
			calls += 1

			return Promise.resolve(true)
		}
		const schema = createSchema({
			create: true,
			read: { where: read },
			update: { item: update },
		})
		const declarations = getSchemaAccessDeclarations(schema)

		expect(declarations).toStrictEqual({
			filter: { read },
			item: { update },
			operation: { create: true },
		})
		expect(calls).toBe(0)
	})

	it('retains declarations by exact schema identity', () => {
		const first = createSchema({ read: true })
		const second = createSchema({ read: false })

		expect(getSchemaAccessDeclarations(first)?.operation?.read).toBe(true)
		expect(getSchemaAccessDeclarations(second)?.operation?.read).toBe(false)
	})

	it('does not allocate defaults for omitted or empty declarations', () => {
		expect(getSchemaAccessDeclarations(createSchema())).toBeUndefined()
		expect(getSchemaAccessDeclarations(createSchema({}))).toBeUndefined()
		expect(
			getSchemaAccessDeclarations(
				createSchema({ create: {}, read: {}, update: {} }),
			),
		).toBeUndefined()
	})

	it('keeps structural plans independent from Access callbacks', () => {
		const plain = createSchema()
		const protectedSchema = createSchema({
			read: false,
		})

		expect(compileValidationPlans(protectedSchema)).toStrictEqual(
			compileValidationPlans(plain),
		)
	})

	it.each([
		[null, 'access must be a plain object'],
		[[], 'access must be a plain object'],
		[new Map(), 'access must be a plain object'],
		[{ unknown: {} }, 'Unknown schema Access family: access.unknown'],
		[{ read: null }, 'access.read must be a boolean, function, or object'],
		[
			{ update: { unknown: true } },
			'Unknown Access rule: access.update.unknown',
		],
		[{ create: { where: {} } }, 'Unknown Access rule: access.create.where'],
		[{ read: { item: true } }, 'Unknown Access rule: access.read.item'],
		[{ read: { allow: 'allow' } }, 'access.read.allow must be a plain object'],
		[
			{ read: { allow: undefined } },
			'access.read.allow must be a plain object',
		],
		[{ read: { allow: {} } }, 'access.read.allow.one is required'],
		[
			{ read: { where: false } },
			'access.read.where must be a plain object or function',
		],
		[
			{
				read: {
					allow: { count: true, exists: true, many: true, one: 'allow' },
				},
			},
			'access.read.allow.one must be a boolean or function',
		],
		[
			{
				read: {
					allow: {
						count: true,
						exists: true,
						many: true,
						one: true,
						unknown: true,
					},
				},
			},
			'Unknown Access rule: access.read.allow.unknown',
		],
	] as const)('rejects malformed schema declarations %#', (access, message) => {
		expect(() => normalizeSchemaAccessDeclarations(access)).toThrow(
			new TypeError(message),
		)
	})

	it('rejects symbol keys at every declaration level', () => {
		expect(() =>
			normalizeSchemaAccessDeclarations({ [Symbol('level')]: {} }),
		).toThrow(new TypeError('access contains an unsupported symbol key'))
		expect(() =>
			normalizeSchemaAccessDeclarations({
				update: { [Symbol('rule')]: true },
			}),
		).toThrow(new TypeError('access.update contains an unsupported symbol key'))
	})
})
