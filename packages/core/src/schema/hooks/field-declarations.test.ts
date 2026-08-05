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
import { getHookHandlerEntries } from './normalization.js'

const onError: FieldErrorHook = () => undefined
const expectedOnErrorDeclarations = {
	onError: {
		all: [{ declarationBranch: 'direct', handler: onError, handlerIndex: 0 }],
		variants: {},
	},
}

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

const declareStringFieldFromUnknown = (options: unknown): GenericField =>
	Reflect.apply(stringField, undefined, [options]) as GenericField

describe('field hook declarations', () => {
	it.each(builtInFields)(
		'keeps %s hooks in private capabilities instead of field metadata',
		(_kind, field) => {
			const declarations = getFieldHookDeclarations(field)

			expect(declarations).toStrictEqual(expectedOnErrorDeclarations)
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
		expect(getFieldHookDeclarations(field)).toStrictEqual(
			expectedOnErrorDeclarations,
		)
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

		expect(getHookHandlerEntries(declarations, 'onError')[0]?.handler).toBe(
			onError,
		)
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
		expect(
			getHookHandlerEntries(firstDeclarations, 'onError')[0]?.handler,
		).toBe(firstHandler)
		expect(
			getHookHandlerEntries(secondDeclarations, 'onError')[0]?.handler,
		).toBe(secondHandler)
	})

	it('precomposes every broad field lifecycle according to its timing', () => {
		const broad = () => undefined
		const specific = () => undefined
		const field = declareStringFieldFromUnknown({
			hooks: {
				afterRollback: { all: broad, delete: specific },
				onChange: { all: broad, delete: specific },
				resolveOutput: { all: broad, read: specific },
			},
		})
		const declarations = getFieldHookDeclarations(field)

		expect(
			getHookHandlerEntries(declarations, 'onChange', 'delete').map(
				({ handler }) => handler,
			),
		).toStrictEqual([broad, specific])
		expect(
			getHookHandlerEntries(declarations, 'resolveOutput', 'read').map(
				({ handler }) => handler,
			),
		).toStrictEqual([specific, broad])
		expect(
			getHookHandlerEntries(declarations, 'afterRollback', 'delete').map(
				({ handler }) => handler,
			),
		).toStrictEqual([specific, broad])
	})

	it('does not retain empty declarations', () => {
		const omitted = stringField()
		const empty = stringField({ hooks: {} })

		expect(getFieldHookDeclarations(omitted)).toBeUndefined()
		expect(getFieldHookDeclarations(empty)).toBeUndefined()
		expect(empty.options).not.toHaveProperty('hooks')
	})

	it('keeps declaration-only callbacks out of compiled validation plans', () => {
		const withoutHooks = Schema.define({
			className: 'WithoutFieldHooks',
			fields: { title: stringField({ validation: { required: true } }) },
		})
		const withHooks = Schema.define({
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
			declareStringFieldFromUnknown({ hooks: { beforeRead: onError } }),
		).toThrow(new TypeError('Unknown field hook: hooks.beforeRead'))
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
			).toThrow(
				new TypeError(
					_name === 'an object'
						? 'hooks.onError family map must not be empty'
						: 'hooks.onError must be a function or non-empty handler list',
				),
			)
		},
	)
})
