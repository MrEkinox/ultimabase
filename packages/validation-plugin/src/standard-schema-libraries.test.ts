import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
	definePluginField,
	UltimaBase,
	FrameworkError,
	type FieldOptions,
	type JsonDocument,
	Pointer,
	QueryBuilder,
	RequestContext,
	requestSources,
	type ApplicationCallbackExecutor,
	type CreateOneOperationAst,
	type RuntimeMutationRevalidationStage,
	type SchemaDefinition,
	type SchemaReference,
} from '@ultimabase/core'

import { validationPlugin } from './plugin.js'
import {
	createValidationPlanCache,
	validateMutationInput,
} from './operation-validation.js'

const ValidationApplication = UltimaBase.use(validationPlugin())

const callbacks: ApplicationCallbackExecutor = {
	runApplication: (callback) => callback(),
	runPlugin: (_owner, callback) => callback(),
}

const createFinalMutationValidationStage =
	(): RuntimeMutationRevalidationStage => {
		const readPlans = createValidationPlanCache()
		return (input) => {
			validateMutationInput(input, readPlans(input.operation), callbacks)
			return input.operation
		}
	}

const Target = ValidationApplication.Schema.define({
	className: 'LibraryValidationTarget',
	fields: () => ({}),
})

class LibraryPluginValue {
	constructor(readonly value: string) {}
}

interface ValidatorSet {
	readonly bigint: StandardSchemaV1<bigint>
	readonly binary: StandardSchemaV1<Uint8Array>
	readonly boolean: StandardSchemaV1<boolean>
	readonly enum: StandardSchemaV1<'draft' | 'published'>
	readonly json: StandardSchemaV1<JsonDocument>
	readonly list: StandardSchemaV1<string[]>
	readonly number: StandardSchemaV1<number>
	readonly object: StandardSchemaV1<{ label: string }>
	readonly plugin: StandardSchemaV1<LibraryPluginValue>
	readonly pointer: StandardSchemaV1<
		Pointer<SchemaReference<'LibraryValidationTarget'>>
	>
	readonly rejectedString: StandardSchemaV1<string>
	readonly string: StandardSchemaV1<string>
}

interface LibraryFixture {
	readonly name: string
	readonly validators: ValidatorSet
}

const jsonDocument = (value: unknown): value is JsonDocument =>
	typeof value === 'object' && value !== null

const zodFixture: LibraryFixture = {
	name: 'Zod',
	validators: {
		bigint: z.bigint(),
		binary: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
		boolean: z.boolean(),
		enum: z.enum(['draft', 'published']),
		json: z.custom<JsonDocument>(jsonDocument),
		list: z.array(z.string().min(1)),
		number: z.number(),
		object: z.object({ label: z.string().min(1) }),
		plugin: z.custom<LibraryPluginValue>(
			(value) => value instanceof LibraryPluginValue,
		),
		pointer: z.custom<Pointer<SchemaReference<'LibraryValidationTarget'>>>(
			(value) => value instanceof Pointer,
		),
		rejectedString: z.string().min(2, 'Value must contain two characters'),
		string: z.string().min(1),
	},
}

const valibotFixture: LibraryFixture = {
	name: 'Valibot',
	validators: {
		bigint: v.bigint(),
		binary: v.custom<Uint8Array>((value) => value instanceof Uint8Array),
		boolean: v.boolean(),
		enum: v.picklist(['draft', 'published']),
		json: v.custom<JsonDocument>(jsonDocument),
		list: v.array(v.pipe(v.string(), v.minLength(1))),
		number: v.pipe(v.number(), v.finite()),
		object: v.object({
			label: v.pipe(v.string(), v.minLength(1)),
		}),
		plugin: v.custom<LibraryPluginValue>(
			(value) => value instanceof LibraryPluginValue,
		),
		pointer: v.custom<Pointer<SchemaReference<'LibraryValidationTarget'>>>(
			(value) => value instanceof Pointer,
		),
		rejectedString: v.pipe(
			v.string(),
			v.minLength(2, 'Value must contain two characters'),
		),
		string: v.pipe(v.string(), v.minLength(1)),
	},
}

const fixtures = [zodFixture, valibotFixture] as const

const completeRecord = (
	value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
	id: '0198d1ae-a800-7000-8000-000000000001',
	createdAt: '2026-08-21T12:00:00.000Z',
	updatedAt: '2026-08-21T12:00:00.000Z',
	...value,
})

const validationContext = RequestContext.anonymous({
	requestId: 'standard-schema-library-test',
	source: requestSources.internal,
})

const validateFinalCreate = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: Readonly<Record<string, unknown>>,
): CreateOneOperationAst<TSchema> => {
	new ValidationApplication({
		pluginPrivileges: { logger: false },
		schemas: [Target, schema],
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

/** Builds the same complete Runtime field matrix for each independent library. */
const createSchema = ({ name, validators }: LibraryFixture) => {
	const pluginField = definePluginField<
		LibraryPluginValue,
		`fixture.${string}`,
		FieldOptions<LibraryPluginValue> & {
			readonly validation: typeof validators.plugin
		}
	>(
		`fixture.${name.toLowerCase()}`,
		{ validation: validators.plugin },
		{
			snapshotValue: (value) => {
				if (!(value instanceof LibraryPluginValue)) {
					throw new TypeError('Expected a library plugin value')
				}

				return value
			},
		},
	)

	return ValidationApplication.Schema.define({
		className: `LibraryValidation${name}`,
		fields: (field) => ({
			bigint: field.bigint({ validation: validators.bigint }),
			binary: field.binary({ validation: validators.binary }),
			boolean: field.boolean({ validation: validators.boolean }),
			date: field.date({ validation: validators.string }),
			dateTime: field.dateTime({ validation: validators.string }),
			decimal: field.decimal({ validation: validators.string }),
			enum: field.enum({
				validation: validators.enum,
				values: ['draft', 'published'],
			}),
			float: field.float({ validation: validators.number }),
			int: field.int({ validation: validators.number }),
			json: field.json({ validation: validators.json }),
			list: field.string({ list: true, validation: validators.list }),
			object: field.object({
				fields: (nested) => ({ label: nested.string({ required: true }) }),
				validation: validators.object,
			}),
			plugin: pluginField,
			pointer: field.pointer({
				target: 'LibraryValidationTarget',
				validation: validators.pointer,
			}),
			string: field.string({ validation: validators.string }),
			time: field.time({ validation: validators.string }),
			uuid: field.uuid({ validation: validators.string }),
		}),
	})
}

describe.each(fixtures)('$name Standard Schema conformance', (fixture) => {
	it('validates every canonical built-in and plugin field family', () => {
		const schema = createSchema(fixture)
		const pointer = Target.pointer('target-1')
		const plugin = new LibraryPluginValue('plugin')

		expect(
			validateFinalCreate(schema, {
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
				list: ['first', 'second'],
				object: { label: 'valid' },
				plugin,
				pointer,
				string: 'value',
				time: '12:00:00.000',
				uuid: '0198d1ae-a800-7000-8000-000000000001',
			}),
		).toMatchObject({
			input: { list: ['first', 'second'], object: { label: 'valid' } },
		})
	})

	it('maps vendor diagnostics to the neutral field.validation issue', () => {
		const schema = ValidationApplication.Schema.define({
			className: `LibraryValidationFailure${fixture.name}`,
			fields: (field) => ({
				title: field.string({
					validation: fixture.validators.rejectedString,
				}),
			}),
		})

		try {
			validateFinalCreate(schema, { title: 'x' })
		} catch (error: unknown) {
			expect(readIssues(error)).toContainEqual({
				code: 'field.validation',
				message: 'Value must contain two characters',
				path: ['input', 'title'],
			})
			return
		}

		throw new Error(`${fixture.name} unexpectedly accepted invalid input`)
	})
})

it('keeps validators isolated between applications with the same logical schema', () => {
	const zodValidator = z
		.string()
		.refine((value) => value === 'zod', 'Expected the Zod application value')
	const valibotValidator = v.pipe(
		v.string(),
		v.check(
			(value) => value === 'valibot',
			'Expected the Valibot application value',
		),
	)
	const ZodSchema = ValidationApplication.Schema.define({
		className: 'IsolatedLibraryValidation',
		fields: (field) => ({
			value: field.string({ validation: zodValidator }),
		}),
	})
	const ValibotSchema = ValidationApplication.Schema.define({
		className: 'IsolatedLibraryValidation',
		fields: (field) => ({
			value: field.string({ validation: valibotValidator }),
		}),
	})
	const zodApplication = new ValidationApplication({
		pluginPrivileges: { logger: false },
		schemas: [ZodSchema],
	})
	const valibotApplication = new ValidationApplication({
		pluginPrivileges: { logger: false },
		schemas: [ValibotSchema],
	})

	zodApplication.compile()
	valibotApplication.compile()

	expect(Reflect.get(ZodSchema.fields.value?.options ?? {}, 'validation')).toBe(
		zodValidator,
	)
	expect(
		Reflect.get(ValibotSchema.fields.value?.options ?? {}, 'validation'),
	).toBe(valibotValidator)
	expect(() => validateFinalCreate(ZodSchema, { value: 'valibot' })).toThrow(
		FrameworkError,
	)
	expect(() => validateFinalCreate(ValibotSchema, { value: 'zod' })).toThrow(
		FrameworkError,
	)
})
