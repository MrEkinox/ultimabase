import { describe, expect, it } from 'vitest'

import type { FieldBuilder } from './field-builder.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { materializeSchemaModel } from './model-materialization.js'

// Regressions for accumulators keyed by developer field names: plain
// assignment (`fields[name] = field`) hits the inherited `__proto__` setter,
// and plain reads (`fields[name]`) see `Object.prototype` members. Field maps
// keep every declared name, including `__proto__`, as an ordinary own key.

const protoField = '__proto__'

const ProtoFieldItem = UltimaBase.Schema.define({
	className: 'OwnFieldKeysProtoItem',
	fields: (field) => ({
		// A computed key declares an own `__proto__` property, unlike `__proto__:`.
		[protoField]: field.string(),
		label: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => String(item.title),
			select: { title: true },
		}),
		title: field.string(),
	}),
})

// The same declaration without `__proto__` fixes the expected field order.
const ControlItem = UltimaBase.Schema.define({
	className: 'OwnFieldKeysControlItem',
	fields: (field) => ({
		label: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => String(item.title),
			select: { title: true },
		}),
		title: field.string(),
	}),
})

const readOwnValue = (record: object, key: string): unknown =>
	Object.getOwnPropertyDescriptor(record, key)?.value

describe('schema field maps keyed by developer names', () => {
	it('keeps a declared __proto__ field as an own key in declaration order', () => {
		expect(Object.hasOwn(ProtoFieldItem.fields, protoField)).toBe(true)
		expect(Object.hasOwn(ProtoFieldItem.persistedFields, protoField)).toBe(true)
		expect(readOwnValue(ProtoFieldItem.fields, protoField)).toMatchObject({
			kind: 'string',
		})
		expect(Object.keys(ProtoFieldItem.fields)).toStrictEqual([
			protoField,
			...Object.keys(ControlItem.fields),
		])
		expect(Object.getPrototypeOf(ProtoFieldItem.fields)).toBe(Object.prototype)
	})

	it('rejects inherited Object.prototype names as unknown result fields', () => {
		for (const name of ['toString', 'constructor', 'hasOwnProperty']) {
			expect(() =>
				materializeSchemaModel(ProtoFieldItem, { [name]: 'x' }),
			).toThrow(
				new TypeError(
					`Persisted schema values contain an unknown field: ${name}`,
				),
			)
		}
	})

	it('keeps an own __proto__ value on a plain result (ADR-0310)', () => {
		const values: object = materializeSchemaModel(
			ProtoFieldItem,
			JSON.parse('{"__proto__":"legacy","title":"Hello"}') as object,
		)

		expect(readOwnValue(values, protoField)).toBe('legacy')
		expect(Object.keys(values)).toStrictEqual([protoField, 'title'])
		expect(Object.getPrototypeOf(values)).toBe(Object.prototype)
	})

	it('keeps an own __proto__ key in captured builder option values', () => {
		// The own data key `JSON.parse('{"__proto__":1}')` would produce.
		const payloadDefault = Object.defineProperty({ kept: 2 }, protoField, {
			configurable: true,
			enumerable: true,
			value: 1,
			writable: true,
		})
		const JsonItem = UltimaBase.Schema.define({
			className: 'OwnFieldKeysJsonItem',
			fields: (field) => ({
				payload: field.json({ default: payloadDefault }),
			}),
		})
		const payloadField = readOwnValue(JsonItem.fields, 'payload')
		const options: unknown =
			typeof payloadField === 'object' && payloadField !== null
				? Reflect.get(payloadField, 'options')
				: undefined
		const payload: unknown =
			typeof options === 'object' && options !== null
				? Reflect.get(options, 'default')
				: undefined

		expect(payload).toBeTypeOf('object')
		if (typeof payload !== 'object' || payload === null) return
		expect(readOwnValue(payload, protoField)).toBe(1)
		expect(Object.keys(payload)).toStrictEqual(['kept', protoField])
		expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
	})

	it('rejects an own __proto__ schema or field option as unknown', async () => {
		const ownProto = <TValue extends object>(target: TValue): TValue =>
			Object.defineProperty(target, protoField, {
				configurable: true,
				enumerable: true,
				value: { enabled: true },
				writable: true,
			})
		// `define` takes only Core options (ADR-0297): the key fails at once.
		expect(() =>
			UltimaBase.Schema.define(
				ownProto({
					className: 'OwnFieldKeysSchemaOption',
					fields: (field: FieldBuilder) => ({ title: field.string() }),
				}),
			),
		).toThrow(`Unknown schema option: ${protoField}`)
		const FieldOption = UltimaBase.Schema.define({
			className: 'OwnFieldKeysFieldOption',
			fields: (field) => ({ title: field.string(ownProto({})) }),
		})
		const application = new UltimaBase({ schemas: [FieldOption] })
		expect(() => application.compile()).toThrow(
			`Unknown string field option: ${protoField}`,
		)
		await application.dispose()
	})
})
