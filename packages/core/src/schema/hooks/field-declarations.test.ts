import { describe, expect, it } from 'vitest'

import {
	compileValidationPlans,
	definePluginField,
	Schema,
	stringField,
	type FieldValidationOptions,
} from '../index.js'
import type { GenericField } from '../fields/base/contract.js'
import { getFieldHookDeclarations } from '../fields/base/definition.js'
import { getHookHandlerEntries } from './normalization.js'

const resolveInput = ({ value }: { readonly value: string | null }) => value
const expectedResolveInputDeclarations = {
	resolveInput: {
		all: [
			{
				declarationBranch: 'direct',
				handler: resolveInput,
				handlerIndex: 0,
			},
		],
		variants: {},
	},
}

const declareStringFieldFromUnknown = (options: unknown): GenericField =>
	Reflect.apply(stringField, undefined, [options]) as GenericField

describe('field hook declarations', () => {
	it('keeps resolveInput in private capabilities instead of field metadata', () => {
		const field = stringField({ hooks: { resolveInput } })
		const declarations = getFieldHookDeclarations(field)

		expect(declarations).toStrictEqual(expectedResolveInputDeclarations)
		expect(Object.isFrozen(declarations)).toBe(true)
		expect(field.options).not.toHaveProperty('hooks')
		expect(Object.keys(field)).toStrictEqual(['kind', 'options'])
	})

	it('supports plugin fields without exposing hooks to metadata normalization', () => {
		let normalizedValidation: FieldValidationOptions | undefined
		const pluginResolveInput = () => undefined
		const field = definePluginField(
			'fixture.slug',
			{
				hooks: { resolveInput: pluginResolveInput },
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
		expect(getFieldHookDeclarations(field)).toStrictEqual({
			resolveInput: {
				all: [
					{
						declarationBranch: 'direct',
						handler: pluginResolveInput,
						handlerIndex: 0,
					},
				],
				variants: {},
			},
		})
		expect(field.options).not.toHaveProperty('hooks')
	})

	it('copies and freezes declarations while retaining handler identity', () => {
		const replacement = ({ value }: { readonly value: string | null }) => value
		const hooks: { resolveInput?: typeof resolveInput } = { resolveInput }
		const field = stringField({ hooks })
		const declarations = getFieldHookDeclarations(field)

		hooks.resolveInput = replacement

		expect(
			getHookHandlerEntries(declarations, 'resolveInput')[0]?.handler,
		).toBe(resolveInput)
		expect(Object.isFrozen(declarations)).toBe(true)
		expect(Reflect.set(declarations ?? {}, 'resolveInput', replacement)).toBe(
			false,
		)
	})

	it('precomposes broad resolveInput hooks before their specific family', () => {
		const broad = ({ value }: { readonly value: string | null }) => value
		const specific = ({ value }: { readonly value: string | null }) => value
		const field = declareStringFieldFromUnknown({
			hooks: { resolveInput: { all: broad, update: specific } },
		})
		const declarations = getFieldHookDeclarations(field)

		expect(
			getHookHandlerEntries(declarations, 'resolveInput', 'update').map(
				({ handler }) => handler,
			),
		).toStrictEqual([broad, specific])
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
					hooks: { resolveInput: ({ value }) => value },
				}),
			},
		})

		const plainPlan = compileValidationPlans(withoutHooks)
		const hookedPlan = compileValidationPlans(withHooks)

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

	it('rejects removed and unknown hook phases with their complete path', () => {
		expect(() =>
			declareStringFieldFromUnknown({
				hooks: { beforeOperation: () => undefined },
			}),
		).toThrow(new TypeError('Unknown field hook: hooks.beforeOperation'))
	})

	it('rejects symbol hook phases without silently copying them', () => {
		const hooks = { [Symbol('private-hook')]: resolveInput }

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
				declareStringFieldFromUnknown({ hooks: { resolveInput: handler } }),
			).toThrow(
				new TypeError(
					_name === 'an object'
						? 'hooks.resolveInput family map must not be empty'
						: 'hooks.resolveInput must be a function or non-empty handler list',
				),
			)
		},
	)
})
