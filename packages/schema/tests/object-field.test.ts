import { describe, expect, it } from 'vitest'
import { immutableRecord } from '@ultimabase/shared'

import {
	bigintField,
	binaryField,
	booleanField,
	dateField,
	dateTimeField,
	decimalField,
	definePluginField,
	enumField,
	floatField,
	intField,
	jsonField,
	objectField,
	stringField,
	timeField,
	uuidField,
	type FieldDefinition,
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
			typeName: 'Preferences',
			fields,
			description: 'Embedded preferences',
		})

		Reflect.deleteProperty(fields, 'name')

		// The field map is detached while each immutable child remains reusable.
		expect(field.options.fields.name.options).toStrictEqual({})
		expect(field.options.fields.enabled.options.default).toBe(true)
		expect(field.options.typeName).toBe('Preferences')
		expect(Object.isFrozen(field.options.fields)).toBe(true)
	})

	it('rejects invalid explicit type names', () => {
		expect(() => objectField({ typeName: '', fields: {} })).toThrow(
			new TypeError('typeName must be a non-empty string'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime coverage crosses the type-name boundary.
			objectField({ typeName: 42, fields: {} })
		}).toThrow(new TypeError('typeName must be a non-empty string'))
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
			updatedAt: '2026-07-30T12:00:00.000Z',
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
				updatedAt: dateTimeField(),
			},
			default: objectDefault,
		})

		listDefault[0] = { label: 'changed' }
		objectDefault.flags.push(false)
		objectDefault.updatedAt = '2030-07-30T12:00:00.000Z'

		expect(list.options.default.at(0)?.label).toBe('first')
		expect(Object.isFrozen(list.options.default)).toBe(true)
		expect(Object.isFrozen(list.options.default[0])).toBe(true)
		expect(object.options.default.flags).toStrictEqual([true])
		expect(object.options.default.updatedAt).toBe('2026-07-30T12:00:00.000Z')
		expect(Object.isFrozen(object.options.default.flags)).toBe(true)
	})

	it('delegates structured default snapshots to plugin fields', () => {
		const source = { label: 'initial' }
		const customField = definePluginField(
			'fixture.snapshot',
			{},
			{
				normalizeValue: (value: unknown, path: string) => {
					if (
						typeof value !== 'object' ||
						value === null ||
						!('label' in value) ||
						typeof value.label !== 'string'
					) {
						throw new TypeError(`${path} must contain a label`)
					}

					// The owning plugin controls the snapshot for its logical value.
					return immutableRecord({ label: value.label })
				},
			},
		)
		const field = objectField({
			fields: {
				custom: customField,
			},
			default: {
				custom: source,
			},
		})

		source.label = 'changed'

		expect(field.options.default.custom.label).toBe('initial')
		expect(field.options.default.custom).not.toBe(source)
		expect(Object.isFrozen(field.options.default.custom)).toBe(true)
	})

	it('copies binary values nested inside structured defaults', () => {
		const source = new Uint8Array([1, 2, 3])
		const field = objectField({
			fields: {
				payload: binaryField(),
			},
			default: {
				payload: source,
			},
		})

		source[0] = 9

		// Nested binary defaults retain the same defensive-copy boundary as direct fields.
		expect(field.options.default.payload).toStrictEqual(
			new Uint8Array([1, 2, 3]),
		)
		expect(field.options.default.payload).not.toBe(source)
	})

	it('normalizes every built-in value inside structured defaults', () => {
		const field = objectField({
			fields: {
				largeCount: bigintField(),
				publishedOn: dateField(),
				price: decimalField(),
				status: enumField({ values: { Draft: 'draft' } }),
				visibility: enumField({ values: ['public', 'private'] }),
				ratio: floatField(),
				count: intField(),
				identifier: uuidField(),
				reminder: timeField(),
				profile: objectField({ fields: { name: stringField() } }),
			},
			default: {
				largeCount: 9_000_000_000_000_000_000n,
				publishedOn: '2026-07-31',
				price: '19.99',
				status: 'draft',
				visibility: 'public',
				ratio: 0.5,
				count: 2,
				identifier: '018f5f6d-9c6f-7f0c-b70b-49d70f503c8b',
				reminder: '14:30:00.000',
				profile: { name: 'Ada' },
			},
		})

		expect(field.options.default).toMatchObject({
			largeCount: 9_000_000_000_000_000_000n,
			price: '19.99',
			status: 'draft',
			visibility: 'public',
			ratio: 0.5,
			count: 2,
			profile: { name: 'Ada' },
		})
		expect(Object.isFrozen(field.options.default.profile)).toBe(true)
	})

	it('rejects missing, unknown, and unregistered plugin values in object defaults', () => {
		expect(() => {
			objectField({
				fields: { name: stringField() },
				default: { name: 'Ada', extra: true },
			})
		}).toThrow(new TypeError('default.extra is not a declared field'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects incomplete object defaults.
			objectField({ fields: { name: stringField() }, default: {} })
		}).toThrow(new TypeError('default.name is required in an object default'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects values outside the enum domain.
			objectField({
				fields: { status: enumField({ values: ['draft'] }) },
				default: { status: 'published' },
			})
		}).toThrow(new TypeError('default.status must be a declared enum value'))

		const forgedPlugin: FieldDefinition<'fixture.forged', string, object> = {
			kind: 'fixture.forged',
			options: {},
		}

		expect(() =>
			objectField({
				fields: { custom: forgedPlugin },
				default: { custom: 'value' },
			}),
		).toThrow(
			new TypeError(
				'default.custom uses a plugin field not created by definePluginField',
			),
		)
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

		expect(() => {
			// @ts-expect-error -- Runtime coverage protects each untyped list entry.
			stringField({ list: [true, false] })
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
		expect(() => objectField({ fields: { '': stringField() } })).toThrow(
			new TypeError('object field name must be a non-empty string'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the field boundary.
			objectField({
				fields: {
					name: 'string',
				},
			})
		}).toThrow(new TypeError('fields.name must be a field definition'))
	})

	it('rejects malformed nested object definitions', () => {
		const invalidShape = { kind: 42, options: {} }
		const missingFields = { kind: 'object', options: {} } as const

		expect(() => {
			// @ts-expect-error -- Runtime coverage protects dynamically forged fields.
			objectField({ fields: { invalidShape } })
		}).toThrow(new TypeError('fields.invalidShape must be a field definition'))

		expect(() => objectField({ fields: { missingFields } })).toThrow(
			new TypeError('fields.missingFields.options.fields must be a field map'),
		)
	})

	it('rejects unsupported and circular structured defaults', () => {
		const circular: Record<string, unknown> = {}

		circular.self = circular

		expect(() => {
			// Runtime normalization requires a declared object value at this boundary.
			objectField({ fields: {}, default: Symbol('invalid') })
		}).toThrow(new TypeError('default must be a plain object'))

		expect(() =>
			// @ts-expect-error -- Runtime coverage protects circular untyped JSON input.
			objectField({
				fields: { payload: jsonField() },
				default: { payload: circular },
			}),
		).toThrow(
			new TypeError(
				'default.payload.self must not contain circular references',
			),
		)

		expect(() =>
			// @ts-expect-error -- Runtime coverage protects forged structured defaults.
			objectField({
				fields: { updatedAt: dateField() },
				default: { updatedAt: new Date(Number.NaN) },
			}),
		).toThrow(new TypeError('default.updatedAt must be a calendar date string'))

		expect(() => objectField({ fields: {}, default: new Map() })).toThrow(
			new TypeError('default must be a plain object'),
		)
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
