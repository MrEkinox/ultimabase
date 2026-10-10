import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it, vi } from 'vitest'

import type { Pointer } from '@ultimabase/core'
import {
	createFinalMutationValidationStage as createCoreFinalMutationValidationStage,
	createRuntimeValidationStage,
	compileValidationPlans,
	definePluginField,
	FrameworkError,
	type FieldOptions,
	type JsonDocument,
	UltimaBase,
	type ApplicationCallbackExecutor,
	type CreateOneOperationAst,
	type RuntimeMutationRevalidationStage,
	type SchemaDefinition,
	type SchemaReference,
	snapshotRuntimeResultRecord,
} from '@ultimabase/core'
import {
	createValidationPlanCache,
	validateMutationInput,
} from './operation-validation.js'
import { readValidationIssues } from './field-validation-fixture.js'
import { validationPlugin } from './plugin.js'
import {
	QueryBuilder,
	RequestContext,
	requestSources,
} from '@ultimabase/core/plugin'

const ValidationApplication = UltimaBase.use(validationPlugin())

const callbacks: ApplicationCallbackExecutor = {
	runApplication: (callback) => callback(),
	runPlugin: (_owner, callback) => callback(),
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
	((typeof value === 'object' && value !== null) ||
		typeof value === 'function') &&
	typeof Reflect.get(value, 'then') === 'function'

const createFinalMutationValidationStage =
	(): RuntimeMutationRevalidationStage => {
		const validateStructure = createCoreFinalMutationValidationStage()
		const readPlans = createValidationPlanCache()
		return (input) => {
			const operation = validateStructure(input)
			if (isPromiseLike(operation)) {
				throw new TypeError(
					'Core final mutation validation must be synchronous',
				)
			}
			const plans = readPlans(operation)
			validateMutationInput({ ...input, operation }, plans, callbacks)
			return operation
		}
	}

const rejectingString = (
	message: string,
	path?: StandardSchemaV1.Issue['path'],
): StandardSchemaV1<string> => ({
	'~standard': {
		version: 1,
		vendor: 'ultimabase-tests',
		validate: (value) =>
			typeof value === 'string' && value.length > 0
				? { value }
				: { issues: [{ message, ...(path === undefined ? {} : { path }) }] },
	},
})

const completeRecord = (
	value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
	id: '0198d1ae-a800-7000-8000-000000000001',
	createdAt: '2026-08-21T12:00:00.000Z',
	updatedAt: '2026-08-21T12:00:00.000Z',
	...value,
})

const validationContext = RequestContext.anonymous({
	requestId: 'field-standard-schema-test',
	source: requestSources.internal,
})

/** Exercises application validation only through the mandatory final mutation stage. */
const validateFinalCreate = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: Readonly<Record<string, unknown>>,
	dependencies: readonly SchemaDefinition[] = [],
): CreateOneOperationAst<TSchema> => {
	new ValidationApplication({
		pluginPrivileges: { logger: false },
		schemas: [...dependencies, schema],
	}).compile()
	const operation = {
		input: completeRecord(input),
		kind: 'create-one',
		selection: new QueryBuilder(schema).ast.selection,
		schema: new QueryBuilder(schema).ast.schema,
	} as unknown as CreateOneOperationAst<TSchema>

	return createFinalMutationValidationStage()({
		context: validationContext,
		operation,
		previousOperation: operation,
		target: undefined,
	}) as CreateOneOperationAst<TSchema>
}

const passThrough = <TValue>(
	validate: (value: unknown) => void,
): StandardSchemaV1<TValue> => ({
	'~standard': {
		version: 1,
		vendor: 'family-test',
		validate: (value) => {
			validate(value)
			return { value: value as TValue }
		},
	},
})

describe('Standard Schema field validation', () => {
	it('validates canonical values produced by field generators', async () => {
		const validate = vi.fn((value: unknown) =>
			value === '2026-08-21'
				? { value }
				: { issues: [{ message: 'Expected generated date' }] },
		)
		const validator: StandardSchemaV1<string> = {
			'~standard': { version: 1, vendor: 'generator-test', validate },
		}
		const schema = ValidationApplication.Schema.define({
			className: 'ValidatedGeneratedValue',
			fields: (field) => ({
				day: field.date({
					autoNow: true,
					required: true,
					validation: validator,
				}),
			}),
		})
		const operation = {
			input: {},
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		} satisfies CreateOneOperationAst<typeof schema>

		const context = RequestContext.anonymous({
			requestId: 'generated-validator-test',
			source: requestSources.internal,
		})
		const normalized = await createRuntimeValidationStage({
			clock: () => new Date('2026-08-21T12:00:00.000Z'),
			timezone: 'UTC',
			uuidV7Generator: () => '0198d1ae-a800-7000-8000-000000000001',
		})({
			context,
			operation,
		})
		await createFinalMutationValidationStage()({
			context,
			operation: normalized,
			previousOperation: normalized,
			target: undefined,
		})

		expect(validate).toHaveBeenCalledExactlyOnceWith('2026-08-21')
	})

	it('defers application validation until after explicit input resolution', async () => {
		const validate = vi.fn((value: unknown) =>
			typeof value === 'string' && /^[a-z]+(?:-[a-z]+)*$/u.test(value)
				? { value }
				: { issues: [{ message: 'Expected a canonical slug' }] },
		)
		const validation: StandardSchemaV1<string> = {
			'~standard': {
				validate,
				vendor: 'post-resolution-test',
				version: 1,
			},
		}
		const schema = ValidationApplication.Schema.define({
			className: 'PostResolutionSlug',
			fields: (field) => ({
				slug: field.string({
					required: true,
					validation,
				}),
			}),
		})
		const operation = {
			input: { slug: 'Hello World' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		} satisfies CreateOneOperationAst<typeof schema>
		const context = RequestContext.anonymous({
			requestId: 'post-resolution-test',
			source: requestSources.internal,
		})
		const normalized = await createRuntimeValidationStage()({
			context,
			operation,
		})

		expect(validate).not.toHaveBeenCalled()
		expect(() =>
			createFinalMutationValidationStage()({
				context,
				operation: normalized,
				previousOperation: normalized,
				target: undefined,
			}),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))

		const transformed = {
			...normalized,
			input: { ...normalized.input, slug: 'hello-world' },
		}
		expect(
			createFinalMutationValidationStage()({
				context,
				operation: transformed,
				previousOperation: normalized,
				target: undefined,
			}),
		).toMatchObject({ input: { slug: 'hello-world' } })
	})

	it('runs after every built-in and plugin scalar family snapshot', () => {
		const Target = ValidationApplication.Schema.define({
			className: 'ValidatedPointerTarget',
			fields: () => ({}),
		})
		const pointer = Target.pointer('target-1')
		class PluginValue {
			constructor(readonly value: string) {}
		}
		const pluginValue = new PluginValue('plugin')
		const calls = new Map<string, number>()
		const observe = <TValue>(name: string): StandardSchemaV1<TValue> =>
			passThrough<TValue>(() => {
				calls.set(name, (calls.get(name) ?? 0) + 1)
			})
		const pluginField = definePluginField<
			PluginValue,
			'fixture.validated',
			FieldOptions<PluginValue> & {
				readonly validation: ReturnType<typeof observe<PluginValue>>
			}
		>(
			'fixture.validated',
			{ validation: observe<PluginValue>('plugin') },
			{
				snapshotValue: (value) => {
					if (!(value instanceof PluginValue)) {
						throw new TypeError('Expected PluginValue')
					}

					return value
				},
			},
		)
		const schema = ValidationApplication.Schema.define({
			className: 'ValidatedScalarFamilies',
			fields: (field) => ({
				bigint: field.bigint({ validation: observe<bigint>('bigint') }),
				binary: field.binary({
					validation: observe<Uint8Array>('binary'),
				}),
				boolean: field.boolean({ validation: observe<boolean>('boolean') }),
				date: field.date({ validation: observe<string>('date') }),
				dateTime: field.dateTime({
					validation: observe<string>('dateTime'),
				}),
				decimal: field.decimal({ validation: observe<string>('decimal') }),
				enum: field.enum({
					values: ['draft', 'published'],
					validation: observe<'draft' | 'published'>('enum'),
				}),
				float: field.float({ validation: observe<number>('float') }),
				int: field.int({ validation: observe<number>('int') }),
				json: field.json({ validation: observe<JsonDocument>('json') }),
				plugin: pluginField,
				pointer: field.pointer({
					target: 'ValidatedPointerTarget',
					validation:
						observe<Pointer<SchemaReference<'ValidatedPointerTarget'>>>(
							'pointer',
						),
				}),
				string: field.string({ validation: observe<string>('string') }),
				time: field.time({ validation: observe<string>('time') }),
				uuid: field.uuid({ validation: observe<string>('uuid') }),
			}),
		})

		const values = {
			bigint: 1n,
			binary: new Uint8Array([1]),
			boolean: true,
			date: '2026-08-21',
			dateTime: '2026-08-21T12:00:00.000Z',
			decimal: '1.25',
			enum: 'draft',
			float: 1.5,
			int: 1,
			json: { nested: [true] },
			plugin: pluginValue,
			pointer,
			string: 'value',
			time: '12:00:00.000',
			uuid: '0198d1ae-a800-7000-8000-000000000001',
		} as const

		validateFinalCreate(schema, values, [Target])

		expect([...calls.keys()].sort()).toStrictEqual(
			[
				'bigint',
				'binary',
				'boolean',
				'date',
				'dateTime',
				'decimal',
				'enum',
				'float',
				'int',
				'json',
				'plugin',
				'pointer',
				'string',
				'time',
				'uuid',
			].sort(),
		)
		expect([...calls.values()].every((count) => count === 1)).toBe(true)

		snapshotRuntimeResultRecord(
			compileValidationPlans(schema),
			completeRecord(values),
			['result'],
		)
		expect([...calls.values()].every((count) => count === 1)).toBe(true)
	})

	it('validates complete canonical lists and prefixes nested issue paths', () => {
		const validate = vi.fn((value: unknown) => {
			void value
			return {
				issues: [
					{
						message: 'Second tag is invalid',
						path: [1, { key: 'name' }, Symbol.for('leaf')],
					},
				],
			}
		})
		const validator: StandardSchemaV1<string[]> = {
			'~standard': { version: 1 as const, vendor: 'list-test', validate },
		}
		const schema = ValidationApplication.Schema.define({
			className: 'ValidatedList',
			fields: (field) => ({
				tags: field.string({ list: true, validation: validator }),
			}),
		})

		try {
			validateFinalCreate(schema, { tags: ['first', 'second'] })
			expect.unreachable('Expected list validation to fail')
		} catch (error: unknown) {
			expect(error).toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(readValidationIssues(error)).toContainEqual(
				expect.objectContaining({
					code: 'field.validation',
					message: 'Second tag is invalid',
					path: ['input', 'tags', 1, 'name', 'Symbol(leaf)'],
				}),
			)
		}
		expect(validate).toHaveBeenCalledTimes(1)
		expect(Object.isFrozen(validate.mock.calls[0]?.[0])).toBe(true)
	})

	it('runs child validators before the containing object validator', () => {
		const order: string[] = []
		const child = rejectingString('Name is required')
		const childValidate = child['~standard'].validate
		const parent: StandardSchemaV1<Readonly<{ name: string }>> = {
			'~standard': {
				version: 1 as const,
				vendor: 'object-test',
				validate: (value: unknown) => {
					order.push('parent')
					return { value: value as Readonly<{ name: string }> }
				},
			},
		}
		const observedChild = {
			'~standard': {
				...child['~standard'],
				validate: (value: unknown) => {
					order.push('child')
					return childValidate(value)
				},
			},
		} satisfies StandardSchemaV1<string>
		const schema = ValidationApplication.Schema.define({
			className: 'ValidatedObject',
			fields: (field) => ({
				profile: field.object({
					validation: parent,
					fields: (nested) => ({
						name: nested.string({
							required: true,
							validation: observedChild,
						}),
					}),
				}),
			}),
		})

		validateFinalCreate(schema, { profile: { name: 'Ada' } })

		expect(order).toStrictEqual(['child', 'parent'])
	})

	it('accepts an equal cloned output while retaining the Core snapshot', () => {
		let vendorOutput: Readonly<{ name: string }> | undefined
		const validator: StandardSchemaV1<Readonly<{ name: string }>> = {
			'~standard': {
				version: 1,
				vendor: 'equal-clone-test',
				validate: (value: unknown) => {
					if (
						typeof value !== 'object' ||
						value === null ||
						typeof Reflect.get(value, 'name') !== 'string'
					) {
						return { issues: [{ message: 'Expected profile' }] }
					}

					vendorOutput = { name: Reflect.get(value, 'name') as string }
					return { value: vendorOutput }
				},
			},
		}
		const schema = ValidationApplication.Schema.define({
			className: 'EqualClonedValidationOutput',
			fields: (field) => ({
				profile: field.object({
					fields: (nested) => ({ name: nested.string({ required: true }) }),
					validation: validator,
				}),
			}),
		})

		const result = validateFinalCreate(schema, { profile: { name: 'Ada' } })

		expect(result.input.profile).toStrictEqual({ name: 'Ada' })
		expect(result.input.profile).not.toBe(vendorOutput)
		expect(Object.isFrozen(result.input.profile)).toBe(true)
	})

	it('does not run an object validator after a child rejection', () => {
		const parentValidate = vi.fn((value: unknown) => ({ value }))
		const parent = {
			'~standard': {
				version: 1 as const,
				vendor: 'parent-test',
				validate: parentValidate,
			},
		} as unknown as StandardSchemaV1<Readonly<{ name: string }>>
		const schema = ValidationApplication.Schema.define({
			className: 'RejectedObjectChild',
			fields: (field) => ({
				profile: field.object({
					validation: parent,
					fields: (nested) => ({
						name: nested.string({
							required: true,
							validation: rejectingString('Name is required'),
						}),
					}),
				}),
			}),
		})

		expect(() =>
			validateFinalCreate(schema, { profile: { name: '' } }),
		).toThrow(FrameworkError)
		expect(parentValidate).not.toHaveBeenCalled()
	})

	it('bypasses missing and nullable values and retains validator identity', () => {
		const validate = vi.fn((value: unknown) => ({ value: String(value) }))
		const validator: StandardSchemaV1<string> = {
			'~standard': { version: 1 as const, vendor: 'identity-test', validate },
		}
		const schema = ValidationApplication.Schema.define({
			className: 'OptionalValidation',
			fields: (field) => ({
				note: field.string({ validation: validator }),
			}),
		})
		const noteField = schema.fields.note

		expect(Reflect.get(noteField?.options ?? {}, 'validation')).toBe(validator)
		snapshotRuntimeResultRecord(
			compileValidationPlans(schema),
			completeRecord({}),
			[],
		)
		snapshotRuntimeResultRecord(
			compileValidationPlans(schema),
			completeRecord({ note: null }),
			[],
		)
		expect(validate).not.toHaveBeenCalled()
	})

	it('keeps independent field validators isolated', () => {
		const firstValidate = vi.fn((value: unknown) => ({ value }))
		const secondValidate = vi.fn((value: unknown) => ({ value }))
		const firstValidator = {
			'~standard': {
				version: 1 as const,
				vendor: 'first-isolation-test',
				validate: firstValidate,
			},
		} as unknown as StandardSchemaV1<string>
		const secondValidator = {
			'~standard': {
				version: 1 as const,
				vendor: 'second-isolation-test',
				validate: secondValidate,
			},
		} as unknown as StandardSchemaV1<string>
		const firstSchema = ValidationApplication.Schema.define({
			className: 'FirstIsolatedValidation',
			fields: (field) => ({
				value: field.string({ validation: firstValidator }),
			}),
		})
		const secondSchema = ValidationApplication.Schema.define({
			className: 'SecondIsolatedValidation',
			fields: (field) => ({
				value: field.string({ validation: secondValidator }),
			}),
		})

		validateFinalCreate(firstSchema, { value: 'first' })
		expect(firstValidate).toHaveBeenCalledTimes(1)
		expect(secondValidate).not.toHaveBeenCalled()

		validateFinalCreate(secondSchema, { value: 'second' })
		expect(firstValidate).toHaveBeenCalledTimes(1)
		expect(secondValidate).toHaveBeenCalledTimes(1)
	})

	it.each([
		['async result', () => Promise.resolve({ value: 'value' })],
		['promise-like result', () => ({ then: () => undefined })],
		[
			'thrown error',
			() => {
				throw new Error('vendor failure')
			},
		],
		['transformation', () => ({ value: 'trimmed' })],
		['malformed result', () => ({})],
		['malformed issue list', () => ({ issues: 'invalid' })],
		['malformed issue', () => ({ issues: [{}] })],
		[
			'malformed issue path',
			() => ({ issues: [{ message: 'Invalid', path: 'value' }] }),
		],
		[
			'malformed issue path segment',
			() => ({ issues: [{ message: 'Invalid', path: [{ key: {} }] }] }),
		],
	])('rejects the %s as a validator contract failure', (_name, validate) => {
		const malformedValidator = {
			'~standard': {
				version: 1,
				vendor: 'contract-test',
				validate,
			},
		} as unknown as StandardSchemaV1<string>
		const schema = ValidationApplication.Schema.define({
			className: `ContractFailure${_name}`,
			fields: (field) => ({
				value: field.string({
					validation: malformedValidator,
				}),
			}),
		})

		expect(() => validateFinalCreate(schema, { value: ' value ' })).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'INTERNAL_ERROR',
			}),
		)
	})

	it.each([
		[
			'default insertion',
			(value: Readonly<Record<string, unknown>>) => ({
				value: { ...value, inserted: 'default' },
			}),
		],
		[
			'property stripping',
			(value: Readonly<Record<string, unknown>>) => ({
				value: { name: value.name },
			}),
		],
	] as const)('rejects object %s as a transformation', (_name, transform) => {
		const validator = {
			'~standard': {
				version: 1 as const,
				vendor: 'object-transformation-test',
				validate: (value: unknown) =>
					typeof value === 'object' && value !== null
						? transform(value as Readonly<Record<string, unknown>>)
						: { issues: [{ message: 'Expected object' }] },
			},
		} as unknown as StandardSchemaV1<
			Readonly<{ name: string; role: string | null }>
		>
		const schema = ValidationApplication.Schema.define({
			className: `ObjectTransformation${_name}`,
			fields: (field) => ({
				profile: field.object({
					fields: (nested) => ({
						name: nested.string({ required: true }),
						role: nested.string(),
					}),
					validation: validator,
				}),
			}),
		})

		expect(() =>
			validateFinalCreate(schema, {
				profile: { name: 'Ada', role: 'admin' },
			}),
		).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'INTERNAL_ERROR',
			}),
		)
	})

	it('turns an empty failure into one immutable fallback issue', () => {
		const emptyFailure = {
			'~standard': {
				version: 1,
				vendor: 'empty-test',
				validate: () => ({ issues: [] }),
			},
		} as unknown as StandardSchemaV1<string>
		const schema = ValidationApplication.Schema.define({
			className: 'EmptyValidationFailure',
			fields: (field) => ({
				value: field.string({
					validation: emptyFailure,
				}),
			}),
		})

		try {
			validateFinalCreate(schema, { value: 'value' })
			expect.unreachable('validation should fail')
		} catch (error: unknown) {
			expect(error).toBeInstanceOf(FrameworkError)
			if (error instanceof FrameworkError) {
				const issues = readValidationIssues(error)
				expect(issues).toHaveLength(1)
				expect(Object.isFrozen(issues)).toBe(true)
			}
		}
	})
})
