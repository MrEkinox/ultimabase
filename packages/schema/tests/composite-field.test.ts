import { describe, expect, it } from 'vitest'

import {
	arrayField,
	booleanField,
	dateField,
	objectField,
	stringField,
} from '../src/index.js'

describe('composite fields', () => {
	it('creates a typed array from an existing field', () => {
		const item = stringField({
			validation: {
				length: {
					min: 1,
				},
			},
		})
		const field = arrayField({
			items: item,
			validation: {
				required: true,
			},
			indexed: true,
		})

		expect(field).toStrictEqual({
			kind: 'array',
			options: {
				items: item,
				validation: {
					required: true,
				},
				indexed: true,
			},
		})
		expect(field.options.items).toBe(item)
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('copies the field map of a structured object', () => {
		const fields = {
			name: stringField(),
			enabled: booleanField({ default: true }),
		}
		const field = objectField({
			fields,
			description: 'Embedded preferences',
		})

		Reflect.deleteProperty(fields, 'name')

		// The field map is detached while each immutable child remains reusable.
		expect(field.options.fields.name.options).toStrictEqual({})
		expect(field.options.fields.enabled.options.default).toBe(true)
		expect(Object.isFrozen(field.options.fields)).toBe(true)
	})

	it('supports arbitrary finite object and array nesting', () => {
		const field = arrayField({
			items: objectField({
				fields: {
					name: stringField(),
					groups: arrayField({
						items: arrayField({
							items: stringField(),
						}),
					}),
				},
			}),
		})

		expect(field.options.items.kind).toBe('object')
		expect(field.options.items.options.fields.groups.kind).toBe('array')
		expect(
			field.options.items.options.fields.groups.options.items.options.items
				.kind,
		).toBe('string')
	})

	it('snapshots and freezes structured defaults', () => {
		const arrayDefault = [{ label: 'first' }]
		const objectDefault = {
			flags: [true],
			updatedAt: new Date('2026-07-30T12:00:00.000Z'),
		}
		const list = arrayField({
			items: objectField({
				fields: {
					label: stringField(),
				},
			}),
			default: arrayDefault,
		})
		const object = objectField({
			fields: {
				flags: arrayField({ items: booleanField() }),
				updatedAt: dateField(),
			},
			default: objectDefault,
		})

		arrayDefault[0] = { label: 'changed' }
		objectDefault.flags.push(false)
		objectDefault.updatedAt.setUTCFullYear(2030)

		expect(list.options.default.at(0)?.label).toBe('first')
		expect(Object.isFrozen(list.options.default)).toBe(true)
		expect(Object.isFrozen(list.options.default[0])).toBe(true)
		expect(object.options.default.flags).toStrictEqual([true])
		expect(object.options.default.updatedAt.getUTCFullYear()).toBe(2026)
		expect(Object.isFrozen(object.options.default.flags)).toBe(true)
	})

	it('rejects invalid array element metadata at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the field boundary.
			arrayField({ items: 'string' })
		}).toThrow(new TypeError('items must be a field definition'))
	})

	it('rejects invalid object field metadata at runtime', () => {
		expect(() => {
			objectField({
				fields: {
					// @ts-expect-error -- Runtime coverage intentionally crosses the field boundary.
					name: 'string',
				},
			})
		}).toThrow(new TypeError('fields.name must be a field definition'))
	})

	it('rejects circular field definitions', () => {
		const circular: {
			kind: string
			options: Record<string, unknown>
		} = {
			kind: 'array',
			options: {},
		}

		circular.options.items = circular

		expect(() => {
			// Dynamic metadata still receives the same cycle protection as typed fields.
			arrayField({ items: circular })
		}).toThrow(
			new TypeError(
				'items.options.items must not contain circular field definitions',
			),
		)
	})
})
