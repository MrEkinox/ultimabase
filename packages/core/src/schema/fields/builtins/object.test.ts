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
	pointerField,
	relationField,
	Schema,
	stringField,
	timeField,
	uuidField,
	type FieldDefinition,
} from '../../index.js'
import { replaceDeclaredFieldOptions } from '../base/definition.js'
import {
	requireArray,
	requireDefined,
	requireRecord,
} from '../../../../tests/schema/test-assertions.js'

describe('object fields and list metadata', () => {
	it('adds immutable list metadata without changing the field kind', () => {
		const field = stringField({
			list: true,
			required: true,
			indexed: true,
		})

		expect(field).toStrictEqual({
			kind: 'string',
			options: {
				list: true,
				required: true,
				indexed: true,
			},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
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

	it('supports one-dimensional lists on primitive and object fields', () => {
		const field = objectField({
			list: true,
			fields: {
				name: stringField(),
				groups: stringField({ list: true }),
			},
		})

		expect(field.kind).toBe('object')
		expect(field.options.list).toBe(true)
		expect(field.options.fields.groups.kind).toBe('string')
		expect(field.options.fields.groups.options.list).toBe(true)
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
		const listSnapshot = requireArray(
			requireDefined(list.options.default, 'list.options.default'),
			'list.options.default',
		)
		const firstListItem = requireRecord(listSnapshot[0], 'list default item')
		const objectSnapshot = requireRecord(
			requireDefined(object.options.default, 'object.options.default'),
			'object.options.default',
		)
		const flags = requireArray(objectSnapshot.flags, 'object default flags')

		listDefault[0] = { label: 'changed' }
		objectDefault.flags.push(false)
		objectDefault.updatedAt = '2030-07-30T12:00:00.000Z'

		expect(firstListItem.label).toBe('first')
		expect(Object.isFrozen(listSnapshot)).toBe(true)
		expect(Object.isFrozen(firstListItem)).toBe(true)
		expect(flags).toStrictEqual([true])
		expect(objectSnapshot.updatedAt).toBe('2026-07-30T12:00:00.000Z')
		expect(Object.isFrozen(flags)).toBe(true)
	})

	it('delegates structured default snapshots to plugin fields', () => {
		const source = { label: 'initial' }
		const customField = definePluginField(
			'fixture.snapshot',
			{},
			{
				snapshotValue: (value: unknown, path: string) => {
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
		const defaultValue = requireRecord(
			requireDefined(field.options.default, 'field.options.default'),
			'field.options.default',
		)
		const custom = requireRecord(defaultValue.custom, 'default.custom')

		source.label = 'changed'

		expect(custom.label).toBe('initial')
		expect(custom).not.toBe(source)
		expect(Object.isFrozen(custom)).toBe(true)
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
		const defaultValue = requireRecord(
			requireDefined(field.options.default, 'field.options.default'),
			'field.options.default',
		)

		source[0] = 9

		// Nested binary defaults retain the same defensive-copy boundary as direct fields.
		expect(defaultValue.payload).toStrictEqual(new Uint8Array([1, 2, 3]))
		expect(defaultValue.payload).not.toBe(source)
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
		const defaultValue = requireRecord(
			requireDefined(field.options.default, 'field.options.default'),
			'field.options.default',
		)
		const profile = requireRecord(defaultValue.profile, 'default.profile')

		expect(field.options.default).toMatchObject({
			largeCount: 9_000_000_000_000_000_000n,
			price: '19.99',
			status: 'draft',
			visibility: 'public',
			ratio: 0.5,
			count: 2,
			profile: { name: 'Ada' },
		})
		expect(Object.isFrozen(profile)).toBe(true)
	})

	it('uses create-input presence rules for object defaults', () => {
		expect(() => {
			objectField({
				fields: { name: stringField() },
				default: { name: 'Ada', extra: true },
			} as never)
		}).toThrow(new TypeError('default.extra is not a declared field'))
		expect(
			objectField({ fields: { name: stringField() }, default: {} }).options
				.default,
		).toStrictEqual({})
		expect(() => {
			objectField({
				fields: {
					name: stringField({ required: true }),
				},
				// @ts-expect-error -- Runtime coverage protects missing required values.
				default: {},
			})
		}).toThrow(new TypeError('default.name is required in an object default'))
		expect(
			objectField({
				fields: {
					name: stringField({
						required: true,
						default: 'anonymous',
					}),
				},
				default: {},
			}).options.default,
		).toStrictEqual({})
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects values outside the enum domain.
			objectField({
				fields: { status: enumField({ values: ['draft'] }) },
				default: { status: 'published' },
			})
		}).toThrow(
			new TypeError('Invalid enum default at default.status: published'),
		)

		const forgedPlugin: FieldDefinition<'fixture.forged', string, object> = {
			kind: 'fixture.forged',
			options: {},
		}

		expect(() =>
			objectField({
				fields: { custom: forgedPlugin },
				default: { custom: 'value' },
			}),
		).toThrow(new TypeError('fields.custom must be created by a field factory'))
	})

	it('rejects invalid list metadata at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the list boundary.
			stringField({ list: [] })
		}).toThrow(new TypeError('list must be true or false'))

		expect(() => {
			// @ts-expect-error -- Runtime coverage protects each untyped list entry.
			stringField({ list: [true, false] })
		}).toThrow(new TypeError('list must be true or false'))

		expect(() => {
			// @ts-expect-error -- Multidimensional values belong in jsonField.
			stringField({ list: [true, true] })
		}).toThrow(new TypeError('list must be true or false'))
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
			objectField({
				fields: {
					// @ts-expect-error -- Runtime coverage intentionally crosses the field boundary.
					name: 'string',
				},
			})
		}).toThrow(new TypeError('fields.name must be a field definition'))
	})

	it('rejects pointer and relation fields inside embedded objects', () => {
		const Target = Schema.define({
			className: 'EmbeddedObjectRuntimeTarget',
			fields: () => ({}),
		})

		expect(() => {
			Reflect.apply(objectField, undefined, [
				{ fields: { author: pointerField({ target: () => Target }) } },
			])
		}).toThrow(
			new TypeError(
				'fields.author cannot be a pointer or relation inside objectField',
			),
		)
		expect(() => {
			Reflect.apply(objectField, undefined, [
				{ fields: { tags: relationField({ target: () => Target }) } },
			])
		}).toThrow(
			new TypeError(
				'fields.tags cannot be a pointer or relation inside objectField',
			),
		)
	})

	it('rejects auto-incremented integers inside embedded objects', () => {
		expect(() => {
			Reflect.apply(objectField, undefined, [
				{ fields: { sequence: intField({ autoIncrement: true }) } },
			])
		}).toThrow(
			new TypeError(
				'fields.sequence cannot use autoIncrement inside objectField',
			),
		)
		expect(() => {
			Reflect.apply(objectField, undefined, [
				{ fields: { sequence: bigintField({ autoIncrement: true }) } },
			])
		}).toThrow(
			new TypeError(
				'fields.sequence cannot use autoIncrement inside objectField',
			),
		)
	})

	it('rejects root-only metadata from low-level and transformed fields', () => {
		expect(() =>
			objectField({
				fields: { email: stringField({ indexed: false }) },
			}),
		).toThrow(
			new TypeError('fields.email cannot use indexed inside objectField'),
		)

		const nestedEmail = stringField({ indexed: true })
		const transformedObject = replaceDeclaredFieldOptions(
			objectField({ fields: {} }),
			immutableRecord({
				fields: immutableRecord({ email: nestedEmail }),
			}),
		)

		expect(() =>
			objectField({ fields: { profile: transformedObject } }),
		).toThrow(
			new TypeError(
				'fields.profile.fields.email cannot use indexed inside objectField',
			),
		)

		const generatedDate = replaceDeclaredFieldOptions(
			dateTimeField(),
			immutableRecord({ generatedOn: 'create' }),
		)

		expect(() => objectField({ fields: { createdAt: generatedDate } })).toThrow(
			new TypeError(
				'fields.createdAt cannot use generatedOn inside objectField',
			),
		)
	})

	it('rejects malformed nested object definitions', () => {
		const invalidShape = { kind: 42, options: {} }
		const missingFields = { kind: 'object', options: {} } as const

		expect(() => {
			// @ts-expect-error -- Runtime coverage protects dynamically forged fields.
			objectField({ fields: { invalidShape } })
		}).toThrow(new TypeError('fields.invalidShape must be a field definition'))

		expect(() => objectField({ fields: { missingFields } })).toThrow(
			new TypeError('fields.missingFields must be created by a field factory'),
		)
	})

	it('rejects unsupported and circular structured defaults', () => {
		const circular: Record<string, unknown> = {}

		circular.self = circular

		expect(() => {
			// Runtime normalization requires a declared object value at this boundary.
			objectField({ fields: {}, default: Symbol('invalid') })
		}).toThrow(new TypeError('default must be a plain object'))

		expect(() => {
			// @ts-expect-error -- Runtime coverage protects circular untyped JSON input.
			objectField({
				fields: { payload: jsonField() },
				default: { payload: circular },
			})
		}).toThrow(
			new TypeError(
				'default.payload.self must not contain circular references',
			),
		)

		expect(() => {
			// @ts-expect-error -- Runtime coverage protects forged structured defaults.
			objectField({
				fields: { updatedAt: dateField() },
				default: { updatedAt: new Date(Number.NaN) },
			})
		}).toThrow(
			new TypeError('default.updatedAt must be a calendar date string'),
		)

		expect(() => objectField({ fields: {}, default: new Map() })).toThrow(
			new TypeError('default must be a plain object'),
		)
	})

	it('rejects forged circular object field definitions at provenance boundary', () => {
		const circular: {
			kind: string
			options: Record<string, unknown>
		} = {
			kind: 'object',
			options: {},
		}

		circular.options.fields = { child: circular }

		expect(() => {
			// Factory provenance rejects graphs that cannot be produced by immutable factories.
			objectField({ fields: { circular } })
		}).toThrow(
			new TypeError('fields.circular must be created by a field factory'),
		)
	})
})
