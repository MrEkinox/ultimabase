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
import { normalizeRelationFieldAccessDeclarations } from './field-declarations.js'

const declareStringFieldFromUnknown = (options: unknown): GenericField =>
	Reflect.apply(stringField, undefined, [options]) as GenericField

describe('field Access declarations', () => {
	it.each([
		['scalar', stringField({ access: { read: false } })],
		[
			'enum',
			enumField({
				access: { read: { orderBy: false, output: true, where: true } },
				values: ['draft', 'published'],
			}),
		],
		[
			'object',
			objectField({
				access: { read: { orderBy: false, output: true, where: true } },
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
			{ access: { write: true }, validation: { required: true } },
			{
				snapshotValue: (value, path) => {
					if (typeof value !== 'string') {
						throw new TypeError(`${path} must be a string`)
					}

					return value
				},
			},
		)

		expect(getFieldAccessDeclarations(field)).toStrictEqual({
			write: { clear: true, fill: true, replace: true },
		})
		expect(field.options).not.toHaveProperty('access')
	})

	it('copies complete read channels while preserving callback identity', () => {
		const output = () => true
		const read: {
			orderBy: boolean
			output: typeof output
			where: boolean
		} = { orderBy: false, output, where: false }
		const access = { read }
		const field = stringField({ access })
		const declarations = getFieldAccessDeclarations(field)

		read.output = () => false

		expect(declarations?.read).toStrictEqual({
			filter: false,
			item: output,
			order: false,
		})
		expect(Object.isFrozen(declarations?.read)).toBe(true)
	})

	it('copies complete write transitions while preserving callback identity', () => {
		const fill = () => true
		const write: {
			clear: boolean
			fill: typeof fill
			replace: boolean
		} = {
			clear: false,
			fill,
			replace: true,
		}
		const field = stringField({ access: { write } })
		const declarations = getFieldAccessDeclarations(field)

		write.fill = () => false

		expect(declarations).toStrictEqual({
			write: { clear: false, fill, replace: true },
		})
		expect(Object.isFrozen(declarations?.write)).toBe(true)
	})

	it('copies concise boolean read decisions', () => {
		const access: { read?: boolean } = { read: true }
		const field = stringField({ access })
		const declarations = getFieldAccessDeclarations(field)

		access.read = false

		expect(declarations?.read).toBe(true)
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
			fields: (field) => ({
				title: field.string({ validation: { required: true } }),
			}),
		})
		const protectedSchema = Schema.define({
			className: 'ProtectedFieldAccess',
			fields: (field) => ({
				title: field.string({
					access: { read: false },
					validation: { required: true },
				}),
			}),
		})

		expect(
			compileValidationPlans(protectedSchema).create.fields.title,
		).toStrictEqual(compileValidationPlans(plain).create.fields.title)
	})

	it.each([
		[null, 'access must be a plain object'],
		[[], 'access must be a plain object'],
		[{ create: true }, 'Unknown Access rule: access.create'],
		[{ delete: true }, 'Unknown Access rule: access.delete'],
		[{ filter: true }, 'Unknown Access rule: access.filter'],
		[{ order: false }, 'Unknown Access rule: access.order'],
		[{ update: true }, 'Unknown Access rule: access.update'],
		[{ read: 'allow' }, 'access.read must be a plain object'],
		[
			{ read: () => true },
			'access.read must be a boolean or complete output/where/orderBy object',
		],
		[{ read: {} }, 'access.read.output is required'],
		[
			{ read: { output: true, where: true } },
			'access.read.orderBy is required',
		],
		[
			{ read: { orderBy: false, output: true, unknown: true, where: true } },
			'Unknown Access rule: access.read.unknown',
		],
		[
			{ read: { filter: false, order: false, output: true } },
			'Unknown Access rule: access.read.filter',
		],
		[
			{ write: () => true },
			'access.write must be a boolean or complete fill/replace/clear object',
		],
		[
			{ write: { create: true, update: false } },
			'Unknown Access rule: access.write.create',
		],
		[
			{ write: { fill: true, replace: true } },
			'access.write.clear is required',
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

	it('rejects the legacy relation update capability', () => {
		expect(() =>
			normalizeRelationFieldAccessDeclarations({ update: true }),
		).toThrow(new TypeError('Unknown relation Access rule: access.update'))
	})
})
