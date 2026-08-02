import { describe, expect, it } from 'vitest'

import {
	bigintField,
	binaryField,
	booleanField,
	compileValidationPlans,
	dateField,
	dateTimeField,
	decimalField,
	definePluginField,
	enumField,
	floatField,
	intField,
	jsonField,
	objectField,
	Schema,
	stringField,
	timeField,
	uuidField,
	type FieldErrorHook,
	type FieldValidationOptions,
} from '../index.js'
import type { GenericField } from '../fields/base/contract.js'
import { getFieldHookDeclarations } from '../fields/base/definition.js'

const onError: FieldErrorHook = () => undefined

const builtInFields = [
	['bigint', bigintField({ hooks: { onError } })],
	['binary', binaryField({ hooks: { onError } })],
	['boolean', booleanField({ hooks: { onError } })],
	['date', dateField({ hooks: { onError } })],
	['dateTime', dateTimeField({ hooks: { onError } })],
	['decimal', decimalField({ hooks: { onError } })],
	[
		'enum',
		enumField({
			hooks: { onError },
			values: ['draft', 'published'],
		}),
	],
	['float', floatField({ hooks: { onError } })],
	['int', intField({ hooks: { onError } })],
	['json', jsonField({ hooks: { onError } })],
	[
		'object',
		objectField({
			fields: { label: stringField() },
			hooks: { onError },
		}),
	],
	['string', stringField({ hooks: { onError } })],
	['time', timeField({ hooks: { onError } })],
	['uuid', uuidField({ hooks: { onError } })],
] as const satisfies readonly (readonly [string, GenericField])[]

const declareStringFieldFromUnknown = (options: unknown): unknown =>
	Reflect.apply(stringField, undefined, [options])

describe('field hook declarations', () => {
	it.each(builtInFields)(
		'keeps %s hooks in private capabilities instead of field metadata',
		(_kind, field) => {
			const declarations = getFieldHookDeclarations(field)

			expect(declarations).toStrictEqual({ onError })
			expect(Object.isFrozen(declarations)).toBe(true)
			expect(field.options).not.toHaveProperty('hooks')
			expect(Object.keys(field)).toStrictEqual(['kind', 'options'])
		},
	)

	it('supports plugin fields without exposing hooks to metadata normalization', () => {
		let normalizedValidation: FieldValidationOptions | undefined
		const field = definePluginField(
			'fixture.slug',
			{
				hooks: { onError },
				validation: { required: true },
			},
			{
				normalizeValidation: (validation) => {
					normalizedValidation = validation

					return validation
				},
				snapshotValue: (value, path) => {
					if (typeof value !== 'string') {
						throw new TypeError(`${path} must be a string`)
					}

					return value
				},
			},
		)

		expect(normalizedValidation).toStrictEqual({ required: true })
		expect(normalizedValidation).not.toHaveProperty('hooks')
		expect(getFieldHookDeclarations(field)).toStrictEqual({ onError })
		expect(Object.isFrozen(getFieldHookDeclarations(field))).toBe(true)
		expect(field.options).not.toHaveProperty('hooks')
		expect(Object.keys(field)).toStrictEqual(['kind', 'options'])
	})

	it('copies and freezes declarations while retaining handler identity', () => {
		const replacement: FieldErrorHook = () => undefined
		const hooks: { onError?: FieldErrorHook } = { onError }
		const field = stringField({ hooks })
		const declarations = getFieldHookDeclarations(field)

		hooks.onError = replacement

		expect(declarations?.onError).toBe(onError)
		expect(Object.isFrozen(declarations)).toBe(true)
		expect(Reflect.set(declarations ?? {}, 'onError', replacement)).toBe(false)
	})

	it('keeps declarations isolated by exact field identity', () => {
		const firstHandler: FieldErrorHook = () => undefined
		const secondHandler: FieldErrorHook = () => undefined
		const first = stringField({ hooks: { onError: firstHandler } })
		const second = stringField({ hooks: { onError: secondHandler } })
		const firstDeclarations = getFieldHookDeclarations(first)
		const secondDeclarations = getFieldHookDeclarations(second)

		expect(firstDeclarations).not.toBe(secondDeclarations)
		expect(firstDeclarations?.onError).toBe(firstHandler)
		expect(secondDeclarations?.onError).toBe(secondHandler)
	})

	it('does not retain empty declarations', () => {
		const omitted = stringField()
		const empty = stringField({ hooks: {} })

		expect(getFieldHookDeclarations(omitted)).toBeUndefined()
		expect(getFieldHookDeclarations(empty)).toBeUndefined()
		expect(empty.options).not.toHaveProperty('hooks')
	})

	it('keeps declaration-only callbacks out of compiled validation plans', () => {
		const withoutHooks = new Schema({
			className: 'WithoutFieldHooks',
			fields: { title: stringField({ validation: { required: true } }) },
		})
		const withHooks = new Schema({
			className: 'WithFieldHooks',
			fields: {
				title: stringField({
					validation: { required: true },
					hooks: { onError },
				}),
			},
		})

		const plainPlan = compileValidationPlans(withoutHooks)
		const hookedPlan = compileValidationPlans(withHooks)

		// Class identity differs, but field plan structure must stay physical and equal.
		expect(hookedPlan.create.fields.title).toStrictEqual(
			plainPlan.create.fields.title,
		)
		expect(hookedPlan.update.fields.title).toStrictEqual(
			plainPlan.update.fields.title,
		)
	})

	it.each([
		['null', null],
		['an array', []],
		['a map', new Map<string, unknown>()],
		['a primitive', true],
	] as const)('rejects %s hook declarations', (_name, hooks) => {
		expect(() => declareStringFieldFromUnknown({ hooks })).toThrow(
			new TypeError('hooks must be a plain object'),
		)
	})

	it('rejects unknown hook phases with their complete path', () => {
		expect(() =>
			declareStringFieldFromUnknown({ hooks: { beforeFind: onError } }),
		).toThrow(new TypeError('Unknown field hook: hooks.beforeFind'))
	})

	it('rejects symbol hook phases without silently copying them', () => {
		const hooks = { [Symbol('private-hook')]: onError }

		expect(() => declareStringFieldFromUnknown({ hooks })).toThrow(
			new TypeError('hooks contains an unsupported symbol key'),
		)
	})

	it.each([
		['undefined', undefined],
		['null', null],
		['an object', {}],
		['an array', []],
		['a boolean', false],
	] as const)(
		'rejects %s handlers with their complete path',
		(_name, handler) => {
			expect(() =>
				declareStringFieldFromUnknown({ hooks: { onError: handler } }),
			).toThrow(new TypeError('hooks.onError must be a function'))
		},
	)
})
