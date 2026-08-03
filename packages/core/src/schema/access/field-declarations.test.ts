import { describe, expect, it } from 'vitest'

import {
	compileValidationPlans,
	definePluginField,
	enumField,
	objectField,
	Schema,
	stringField,
	type GenericField,
} from '../index.js'
import { getFieldAccessDeclarations } from '../fields/base/definition.js'

const declareStringFieldFromUnknown = (options: unknown): GenericField =>
	Reflect.apply(stringField, undefined, [options]) as GenericField

describe('field Access declarations', () => {
	it.each([
		['scalar', stringField({ access: { read: false } })],
		[
			'enum',
			enumField({
				access: { read: { filter: true, item: true, order: false } },
				values: ['draft', 'published'],
			}),
		],
		[
			'object',
			objectField({
				access: { read: { filter: true, item: true, order: false } },
				fields: { label: stringField() },
			}),
		],
	] as const satisfies readonly (readonly [string, GenericField])[])(
		'keeps %s declarations in private capabilities',
		(_kind, field) => {
			expect(getFieldAccessDeclarations(field)).toBeDefined()
			expect(Object.isFrozen(getFieldAccessDeclarations(field))).toBe(true)
			expect(field.options).not.toHaveProperty('access')
			expect(Object.keys(field)).toStrictEqual(['kind', 'options'])
		},
	)

	it('supports plugin fields without exposing Access to plugin metadata', () => {
		const field = definePluginField(
			'fixture.slug',
			{ access: { create: true }, validation: { required: true } },
			{
				snapshotValue: (value, path) => {
					if (typeof value !== 'string') {
						throw new TypeError(`${path} must be a string`)
					}

					return value
				},
			},
		)

		expect(getFieldAccessDeclarations(field)).toStrictEqual({ create: true })
		expect(field.options).not.toHaveProperty('access')
	})

	it('copies complete read channels while preserving callback identity', () => {
		const item = () => true
		const read: {
			filter: boolean
			item: typeof item
			order: boolean
		} = { filter: false, item, order: false }
		const access = { read }
		const field = stringField({ access })
		const declarations = getFieldAccessDeclarations(field)

		read.item = () => false

		expect(declarations?.read).toStrictEqual({
			filter: false,
			item,
			order: false,
		})
		expect(Object.isFrozen(declarations?.read)).toBe(true)
	})

	it('copies callbacks while preserving their identity', () => {
		const read = () => true
		const access: { read?: typeof read } = { read }
		const field = stringField({ access })
		const declarations = getFieldAccessDeclarations(field)

		access.read = () => false

		expect(declarations?.read).toBe(read)
		expect(Object.isFrozen(declarations)).toBe(true)
	})

	it('does not retain omitted or empty declarations', () => {
		expect(getFieldAccessDeclarations(stringField())).toBeUndefined()
		expect(
			getFieldAccessDeclarations(stringField({ access: {} })),
		).toBeUndefined()
	})

	it('keeps field Access outside compiled validation plans', () => {
		const plain = Schema.define({
			className: 'PlainFieldAccess',
			fields: { title: stringField({ validation: { required: true } }) },
		})
		const protectedSchema = Schema.define({
			className: 'ProtectedFieldAccess',
			fields: {
				title: stringField({
					access: { read: false },
					validation: { required: true },
				}),
			},
		})

		expect(
			compileValidationPlans(protectedSchema).create.fields.title,
		).toStrictEqual(compileValidationPlans(plain).create.fields.title)
	})

	it.each([
		[null, 'access must be a plain object'],
		[[], 'access must be a plain object'],
		[{ delete: true }, 'Unknown Access rule: access.delete'],
		[{ filter: true }, 'Unknown Access rule: access.filter'],
		[{ order: false }, 'Unknown Access rule: access.order'],
		[{ read: 'allow' }, 'access.read must be a plain object'],
		[{ read: {} }, 'access.read.item is required'],
		[{ read: { filter: true, item: true } }, 'access.read.order is required'],
		[
			{ read: { filter: true, item: true, order: false, unknown: true } },
			'Unknown Access rule: access.read.unknown',
		],
	] as const)('rejects malformed inline declarations %#', (access, message) => {
		expect(() => declareStringFieldFromUnknown({ access })).toThrow(
			new TypeError(message),
		)
	})

	it('rejects symbol capabilities instead of silently copying them', () => {
		expect(() =>
			declareStringFieldFromUnknown({ access: { [Symbol('read')]: true } }),
		).toThrow(new TypeError('access contains an unsupported symbol key'))
	})
})
