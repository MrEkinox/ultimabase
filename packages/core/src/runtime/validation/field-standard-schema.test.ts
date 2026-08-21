import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it, vi } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import { QueryBuilder, type CreateOneOperationAst } from '../../query/index.js'
import {
	compileValidationPlans,
	definePluginField,
	type FieldOptions,
	type JsonDocument,
	objectField,
	Pointer,
	pointerField,
	Schema,
	stringField,
} from '../../schema/index.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import {
	createRuntimeValidationStage,
	snapshotRuntimeResultRecord,
} from './runtime-validation.js'

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

const readIssues = (error: unknown): readonly unknown[] => {
	if (!(error instanceof FrameworkError)) {
		throw error
	}

	const details: unknown = error.publicDetails
	const issues: unknown =
		typeof details === 'object' && details !== null
			? Reflect.get(details, 'issues')
			: undefined

	return Array.isArray(issues) ? issues : []
}

const completeRecord = (
	value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
	id: '0198d1ae-a800-7000-8000-000000000001',
	createdAt: '2026-08-21T12:00:00.000Z',
	updatedAt: '2026-08-21T12:00:00.000Z',
	...value,
})

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
		const schema = Schema.define({
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

		await createRuntimeValidationStage({
			clock: () => new Date('2026-08-21T12:00:00.000Z'),
			timezone: 'UTC',
			uuidV7Generator: () => '0198d1ae-a800-7000-8000-000000000001',
		})({
			context: RequestContext.anonymous({
				requestId: 'generated-validator-test',
				source: requestSources.internal,
			}),
			operation,
		})

		expect(validate).toHaveBeenCalledExactlyOnceWith('2026-08-21')
	})

	it('runs after every built-in and plugin scalar family snapshot', () => {
		const Target = Schema.define({
			className: 'ValidatedPointerTarget',
			fields: () => ({}),
		})
		const pointer = new Pointer(Target, 'target-1')
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
			FieldOptions<PluginValue, ReturnType<typeof observe<PluginValue>>>
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
		const schema = Schema.define({
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
				pointer: pointerField({
					target: () => Target,
					validation: observe<Pointer<typeof Target>>('pointer'),
				}),
				string: field.string({ validation: observe<string>('string') }),
				time: field.time({ validation: observe<string>('time') }),
				uuid: field.uuid({ validation: observe<string>('uuid') }),
			}),
		})

		snapshotRuntimeResultRecord(
			compileValidationPlans(schema),
			completeRecord({
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
			}),
			[],
		)

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
		const schema = Schema.define({
			className: 'ValidatedList',
			fields: (field) => ({
				tags: field.string({ list: true, validation: validator }),
			}),
		})

		try {
			snapshotRuntimeResultRecord(
				compileValidationPlans(schema),
				completeRecord({ tags: ['first', 'second'] }),
				['result'],
			)
			expect.unreachable('Expected list validation to fail')
		} catch (error: unknown) {
			expect(error).toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(readIssues(error)).toContainEqual(
				expect.objectContaining({
					code: 'field.validation',
					message: 'Second tag is invalid',
					path: ['result', 'tags', 1, 'name', 'Symbol(leaf)'],
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
		const schema = Schema.define({
			className: 'ValidatedObject',
			fields: () => ({
				profile: objectField({
					validation: parent,
					fields: {
						name: stringField({
							required: true,
							validation: observedChild,
						}),
					},
				}),
			}),
		})

		snapshotRuntimeResultRecord(
			compileValidationPlans(schema),
			completeRecord({ profile: { name: 'Ada' } }),
			[],
		)

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
		const schema = Schema.define({
			className: 'EqualClonedValidationOutput',
			fields: () => ({
				profile: objectField({
					fields: { name: stringField({ required: true }) },
					validation: validator,
				}),
			}),
		})

		const result = snapshotRuntimeResultRecord(
			compileValidationPlans(schema),
			completeRecord({ profile: { name: 'Ada' } }),
			[],
		)

		expect(result.profile).toStrictEqual({ name: 'Ada' })
		expect(result.profile).not.toBe(vendorOutput)
		expect(Object.isFrozen(result.profile)).toBe(true)
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
		const schema = Schema.define({
			className: 'RejectedObjectChild',
			fields: () => ({
				profile: objectField({
					validation: parent,
					fields: {
						name: stringField({
							required: true,
							validation: rejectingString('Name is required'),
						}),
					},
				}),
			}),
		})

		expect(() =>
			snapshotRuntimeResultRecord(
				compileValidationPlans(schema),
				completeRecord({ profile: { name: '' } }),
				[],
			),
		).toThrow(FrameworkError)
		expect(parentValidate).not.toHaveBeenCalled()
	})

	it('bypasses missing and nullable values and retains validator identity', () => {
		const validate = vi.fn((value: unknown) => ({ value: String(value) }))
		const validator: StandardSchemaV1<string> = {
			'~standard': { version: 1 as const, vendor: 'identity-test', validate },
		}
		const noteField = stringField({ validation: validator })
		const schema = Schema.define({
			className: 'OptionalValidation',
			fields: () => ({ note: noteField }),
		})

		expect(noteField.options.validation).toBe(validator)
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
		const firstSchema = Schema.define({
			className: 'FirstIsolatedValidation',
			fields: (field) => ({
				value: field.string({ validation: firstValidator }),
			}),
		})
		const secondSchema = Schema.define({
			className: 'SecondIsolatedValidation',
			fields: (field) => ({
				value: field.string({ validation: secondValidator }),
			}),
		})

		snapshotRuntimeResultRecord(
			compileValidationPlans(firstSchema),
			completeRecord({ value: 'first' }),
			[],
		)
		expect(firstValidate).toHaveBeenCalledTimes(1)
		expect(secondValidate).not.toHaveBeenCalled()

		snapshotRuntimeResultRecord(
			compileValidationPlans(secondSchema),
			completeRecord({ value: 'second' }),
			[],
		)
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
		const schema = Schema.define({
			className: `ContractFailure${_name}`,
			fields: (field) => ({
				value: field.string({
					validation: malformedValidator,
				}),
			}),
		})

		expect(() =>
			snapshotRuntimeResultRecord(
				compileValidationPlans(schema),
				completeRecord({ value: ' value ' }),
				[],
			),
		).toThrow(
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
		const schema = Schema.define({
			className: `ObjectTransformation${_name}`,
			fields: () => ({
				profile: objectField({
					fields: {
						name: stringField({ required: true }),
						role: stringField(),
					},
					validation: validator,
				}),
			}),
		})

		expect(() =>
			snapshotRuntimeResultRecord(
				compileValidationPlans(schema),
				completeRecord({ profile: { name: 'Ada', role: 'admin' } }),
				[],
			),
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
		const schema = Schema.define({
			className: 'EmptyValidationFailure',
			fields: (field) => ({
				value: field.string({
					validation: emptyFailure,
				}),
			}),
		})

		try {
			snapshotRuntimeResultRecord(
				compileValidationPlans(schema),
				completeRecord({ value: 'value' }),
				[],
			)
			expect.unreachable('validation should fail')
		} catch (error: unknown) {
			expect(error).toBeInstanceOf(FrameworkError)
			if (error instanceof FrameworkError) {
				const issues = readIssues(error)
				expect(issues).toHaveLength(1)
				expect(Object.isFrozen(issues)).toBe(true)
			}
		}
	})
})
