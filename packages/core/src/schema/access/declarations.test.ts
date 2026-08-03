import { describe, expect, it } from 'vitest'

import { compileValidationPlans, Schema, stringField } from '../index.js'
import {
	getSchemaAccessDeclarations,
	normalizeSchemaAccessDeclarations,
} from './declarations.js'

const createSchema = (access?: object) =>
	Schema.define({
		className: 'AccessArticle',
		fields: {
			title: stringField({ validation: { required: true } }),
		},
		// Tests deliberately cross the untrusted JavaScript declaration boundary.
		...(access === undefined ? {} : { access }),
	})

describe('schema Access declarations', () => {
	it('copies and freezes sparse rules without exposing them as metadata', () => {
		const deleteRule = () => true
		const operation: { delete?: typeof deleteRule } = { delete: deleteRule }
		const source = { operation }
		const schema = createSchema(source)
		const declarations = getSchemaAccessDeclarations(schema)

		operation.delete = () => false

		expect(declarations?.operation?.delete).toBe(deleteRule)
		expect(Object.isFrozen(declarations)).toBe(true)
		expect(Object.isFrozen(declarations?.operation)).toBe(true)
		expect(Reflect.set(declarations ?? {}, 'operation', {})).toBe(false)
		expect(Object.keys(schema)).toStrictEqual([
			'definition',
			'className',
			'fields',
			'indexes',
			'extensions',
		])
		expect(schema).not.toHaveProperty('access')
	})

	it('retains booleans and synchronous or asynchronous callbacks verbatim', () => {
		let calls = 0
		const read = () => true
		const update = (): Promise<boolean> => {
			calls += 1

			return Promise.resolve(true)
		}
		const schema = createSchema({
			filter: { delete: false, read },
			item: { update },
			operation: { create: true },
		})
		const declarations = getSchemaAccessDeclarations(schema)

		expect(declarations).toStrictEqual({
			filter: { delete: false, read },
			item: { update },
			operation: { create: true },
		})
		expect(calls).toBe(0)
	})

	it('retains declarations by exact schema identity', () => {
		const first = createSchema({ operation: { read: true } })
		const second = createSchema({ operation: { read: false } })

		expect(getSchemaAccessDeclarations(first)?.operation?.read).toBe(true)
		expect(getSchemaAccessDeclarations(second)?.operation?.read).toBe(false)
	})

	it('does not allocate defaults for omitted or empty declarations', () => {
		expect(getSchemaAccessDeclarations(createSchema())).toBeUndefined()
		expect(getSchemaAccessDeclarations(createSchema({}))).toBeUndefined()
		expect(
			getSchemaAccessDeclarations(
				createSchema({ filter: {}, item: {}, operation: {} }),
			),
		).toBeUndefined()
	})

	it('keeps structural plans independent from Access callbacks', () => {
		const plain = createSchema()
		const protectedSchema = createSchema({
			operation: { read: false },
		})

		expect(compileValidationPlans(protectedSchema)).toStrictEqual(
			compileValidationPlans(plain),
		)
	})

	it.each([
		[null, 'access must be a plain object'],
		[[], 'access must be a plain object'],
		[new Map(), 'access must be a plain object'],
		[{ unknown: {} }, 'Unknown schema Access level: access.unknown'],
		[{ operation: null }, 'access.operation must be a plain object'],
		[
			{ operation: { unknown: true } },
			'Unknown Access rule: access.operation.unknown',
		],
		[{ filter: { create: true } }, 'Unknown Access rule: access.filter.create'],
		[{ item: { read: true } }, 'Unknown Access rule: access.item.read'],
		[
			{ operation: { read: 'allow' } },
			'access.operation.read must be a boolean or function',
		],
		[
			{ operation: { read: undefined } },
			'access.operation.read must be a boolean or function',
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
				operation: { [Symbol('rule')]: true },
			}),
		).toThrow(
			new TypeError('access.operation contains an unsupported symbol key'),
		)
	})
})
