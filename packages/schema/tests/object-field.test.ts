import { describe, expect, it } from 'vitest'

import {
	booleanField,
	dateField,
	objectField,
	stringField,
} from '../src/index.js'

describe('object fields and list metadata', () => {
	it('adds immutable list metadata without changing the field kind', () => {
		const field = stringField({
			list: true,
			validation: {
				length: {
					min: 1,
				},
				required: true,
			},
			indexed: true,
		})

		expect(field).toStrictEqual({
			kind: 'string',
			options: {
				list: true,
				validation: {
					length: {
						min: 1,
					},
					required: true,
				},
				indexed: true,
			},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('copies and freezes nested list depth metadata', () => {
		const depth: [true, true] = [true, true]
		const field = stringField({ list: depth })

		depth.pop()

		expect(field.options.list).toStrictEqual([true, true])
		expect(Object.isFrozen(field.options.list)).toBe(true)
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

	it('supports finite list nesting on primitive and object fields', () => {
		const field = objectField({
			list: true,
			fields: {
				name: stringField(),
				groups: stringField({ list: [true, true] }),
			},
		})

		expect(field.kind).toBe('object')
		expect(field.options.list).toBe(true)
		expect(field.options.fields.groups.kind).toBe('string')
		expect(field.options.fields.groups.options.list).toStrictEqual([true, true])
	})

	it('snapshots and freezes structured list defaults', () => {
		const listDefault = [{ label: 'first' }]
		const objectDefault = {
			flags: [true],
			updatedAt: new Date('2026-07-30T12:00:00.000Z'),
		}
		const list = objectField({
			list: true,
			fields: {
				label: stringField(),
			},
			default: listDefault,
		})
		const object = objectField({
			fields: {
				flags: booleanField({ list: true }),
				updatedAt: dateField(),
			},
			default: objectDefault,
		})

		listDefault[0] = { label: 'changed' }
		objectDefault.flags.push(false)
		objectDefault.updatedAt.setUTCFullYear(2030)

		expect(list.options.default.at(0)?.label).toBe('first')
		expect(Object.isFrozen(list.options.default)).toBe(true)
		expect(Object.isFrozen(list.options.default[0])).toBe(true)
		expect(object.options.default.flags).toStrictEqual([true])
		expect(object.options.default.updatedAt.getUTCFullYear()).toBe(2026)
		expect(Object.isFrozen(object.options.default.flags)).toBe(true)
	})

	it('rejects invalid list metadata at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the list boundary.
			stringField({ list: [] })
		}).toThrow(
			new TypeError(
				'list must be true, false, or a non-empty list of true values',
			),
		)
	})

	it('rejects scalar defaults for list fields at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the default boundary.
			stringField({ list: true, default: 'value' })
		}).toThrow(new TypeError('default must be a list'))
	})

	it('rejects invalid object field metadata at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the field boundary.
			objectField({
				fields: {
					name: 'string',
				},
			})
		}).toThrow(new TypeError('fields.name must be a field definition'))
	})

	it('rejects circular object field definitions', () => {
		const circular: {
			kind: string
			options: Record<string, unknown>
		} = {
			kind: 'object',
			options: {},
		}

		circular.options.fields = { child: circular }

		expect(() => {
			// Dynamic metadata still receives the same cycle protection as typed fields.
			objectField({ fields: { circular } })
		}).toThrow(
			new TypeError(
				'fields.circular.options.fields.child must not contain circular field definitions',
			),
		)
	})
})
