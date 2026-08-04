import { Buffer } from 'node:buffer'

import type {
	FieldValidationPlan,
	GenericField,
	SchemaDefinition,
} from '@ultimabase/core'
import { getPluginFieldStorageCodec } from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import {
	bigint,
	boolean,
	customType,
	date,
	doublePrecision,
	jsonb,
	numeric,
	text,
	time,
	timestamp,
	uuid,
	type PgColumnBuilderBase,
} from 'drizzle-orm/pg-core'

import type {
	PostgresFieldGeneration,
	PostgresStorageKind,
} from './contracts.js'
import {
	createPostgresValueCodec,
	createPostgresPointerValueCodec,
	type PostgresValueCodec,
} from './value-codec.js'

type StaticDefault =
	| { readonly present: false }
	| { readonly present: true; readonly value: unknown }

interface CompiledPostgresFieldBuilder {
	readonly builder: PgColumnBuilderBase
	readonly codec: PostgresValueCodec
	readonly generation: PostgresFieldGeneration | undefined
	readonly storage: PostgresStorageKind
}

/** Supplies a resolved target only for a top-level pointer field. */
export interface PostgresPointerCompilerContext {
	readonly target: SchemaDefinition
}

interface ConfigurableColumnBuilder extends PgColumnBuilderBase {
	readonly notNull: () => PgColumnBuilderBase
	readonly primaryKey: () => PgColumnBuilderBase
}

const bytea = customType<{
	data: Uint8Array
	driverData: Uint8Array
}>({
	dataType: () => 'bytea',
	fromDriver: (value) => Uint8Array.from(value),
	toDriver: (value) => Buffer.from(value),
})

const readStaticDefault = (field: GenericField): StaticDefault => {
	const options = readFieldOptions(field)

	if (
		!Object.hasOwn(options, 'default') ||
		typeof options.default === 'function'
	) {
		return { present: false }
	}

	return { present: true, value: options.default }
}

const requireDefault = <TValue>(
	declared: StaticDefault,
	guard: (value: unknown) => value is TValue,
	fieldName: string,
): TValue | undefined => {
	if (!declared.present) {
		return undefined
	}

	if (!guard(declared.value)) {
		throw new TypeError(
			`Invalid static default for PostgreSQL field: ${fieldName}`,
		)
	}

	return declared.value
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isBigint = (value: unknown): value is bigint => typeof value === 'bigint'
const isBoolean = (value: unknown): value is boolean =>
	typeof value === 'boolean'
const isBinary = (value: unknown): value is Uint8Array =>
	value instanceof Uint8Array

const readFieldOptions = (
	field: GenericField,
): Readonly<Record<string, unknown>> => {
	const options: unknown = field.options

	if (!isPlainRecord(options)) {
		throw new TypeError(`Invalid options for PostgreSQL field: ${field.kind}`)
	}

	return options
}

const hasOption = (field: GenericField, name: string): boolean =>
	Object.hasOwn(readFieldOptions(field), name)

const optionIsTrue = (field: GenericField, name: string): boolean => {
	const options = readFieldOptions(field)

	return Object.hasOwn(options, name) && options[name] === true
}

const shouldBeNotNull = (plan: FieldValidationPlan): boolean =>
	!plan.nullable &&
	(plan.presence === 'required' ||
		hasOption(plan.field, 'default') ||
		optionIsTrue(plan.field, 'autoNow') ||
		optionIsTrue(plan.field, 'autoIncrement') ||
		hasOption(plan.field, 'generatedOn'))

const finalizeBuilder = (
	builder: ConfigurableColumnBuilder,
	plan: FieldValidationPlan,
	fieldName: string,
): PgColumnBuilderBase => {
	if (
		fieldName === 'id' &&
		optionIsTrue(plan.field, 'system') &&
		plan.field.kind === 'uuid'
	) {
		return builder.primaryKey()
	}

	return shouldBeNotNull(plan) ? builder.notNull() : builder
}

const readGeneration = (
	field: GenericField,
): PostgresFieldGeneration | undefined => {
	if (!hasOption(field, 'generatedOn')) {
		return undefined
	}

	const options = readFieldOptions(field)
	const on = options.generatedOn

	if (on !== 'create' && on !== 'createAndUpdate') {
		throw new TypeError(`Invalid generatedOn metadata for field: ${field.kind}`)
	}

	if (hasOption(field, 'uuidVersion')) {
		if (options.uuidVersion !== 7) {
			throw new TypeError('System UUID fields must use UUID version 7')
		}

		return immutableRecord({ on, uuidVersion: 7 })
	}

	return immutableRecord({ on })
}

const readTimezone = (field: GenericField, fallback: boolean): boolean =>
	hasOption(field, 'timezone')
		? readFieldOptions(field).timezone === true
		: fallback

const readDecimalConfig = (
	field: GenericField,
): {
	readonly precision?: number
	readonly scale?: number
	readonly mode: 'string'
} => {
	const options = readFieldOptions(field)
	const validation = hasOption(field, 'validation')
		? options.validation
		: undefined
	const precision =
		typeof validation === 'object' &&
		validation !== null &&
		'precision' in validation &&
		typeof validation.precision === 'number'
			? validation.precision
			: undefined
	const scale =
		typeof validation === 'object' &&
		validation !== null &&
		'scale' in validation &&
		typeof validation.scale === 'number'
			? validation.scale
			: undefined

	return {
		mode: 'string',
		...(precision === undefined ? {} : { precision }),
		...(scale === undefined ? {} : { scale }),
	}
}

const readEnumValues = (field: GenericField): [string, ...string[]] => {
	const options = readFieldOptions(field)
	const source = hasOption(field, 'values') ? options.values : undefined
	const values: readonly unknown[] = isUnknownArray(source)
		? source
		: isPlainRecord(source)
			? Object.values(source)
			: []

	if (
		values.length === 0 ||
		!values.every((value): value is string => typeof value === 'string')
	) {
		throw new TypeError(
			'PostgreSQL enum fields require non-empty string values',
		)
	}

	const [first, ...rest] = values

	if (first === undefined) {
		throw new TypeError('PostgreSQL enum fields require at least one value')
	}

	return [first, ...rest]
}

const createCompiledBuilder = (
	builder: ConfigurableColumnBuilder,
	plan: FieldValidationPlan,
	fieldName: string,
	codec: PostgresValueCodec,
	generation: PostgresFieldGeneration | undefined,
	storage: PostgresStorageKind,
): CompiledPostgresFieldBuilder => ({
	builder: finalizeBuilder(builder, plan, fieldName),
	codec,
	generation,
	storage,
})

const compileJsonbBuilder = (
	fieldName: string,
	plan: FieldValidationPlan,
	declaredDefault: StaticDefault,
): CompiledPostgresFieldBuilder => {
	const codec = createPostgresValueCodec(plan, true)
	const builder = jsonb(fieldName)
	const withDefault = declaredDefault.present
		? builder.default(codec.encode(declaredDefault.value))
		: builder

	return createCompiledBuilder(
		withDefault,
		plan,
		fieldName,
		codec,
		readGeneration(plan.field),
		'jsonb',
	)
}

const assertScalarAutoIncrement = (
	field: GenericField,
	fieldName: string,
): boolean => {
	const autoIncrement = optionIsTrue(field, 'autoIncrement')

	if (autoIncrement && hasOption(field, 'default')) {
		throw new TypeError(
			`PostgreSQL autoIncrement cannot be combined with default: ${fieldName}`,
		)
	}

	return autoIncrement
}

/** Compiles one top-level built-in field into private Drizzle metadata. */
export const compilePostgresFieldBuilder = (
	fieldName: string,
	plan: FieldValidationPlan,
	pointerContext?: PostgresPointerCompilerContext,
): CompiledPostgresFieldBuilder => {
	const field = plan.field
	const declaredDefault = readStaticDefault(field)

	if (plan.kind !== 'scalar') {
		if (optionIsTrue(field, 'autoIncrement')) {
			throw new TypeError(
				`PostgreSQL autoIncrement is unavailable for JSONB fields: ${fieldName}`,
			)
		}

		return compileJsonbBuilder(fieldName, plan, declaredDefault)
	}

	if (getPluginFieldStorageCodec(field) !== undefined) {
		return compileJsonbBuilder(fieldName, plan, declaredDefault)
	}

	const codec =
		field.kind === 'pointer'
			? pointerContext === undefined
				? undefined
				: createPostgresPointerValueCodec(plan, pointerContext.target)
			: createPostgresValueCodec(plan, false)

	if (codec === undefined) {
		throw new TypeError(
			`PostgreSQL pointer target is unavailable: ${fieldName}`,
		)
	}
	const generation = readGeneration(field)
	const finish = (
		builder: ConfigurableColumnBuilder,
		storage: PostgresStorageKind,
	): CompiledPostgresFieldBuilder =>
		createCompiledBuilder(builder, plan, fieldName, codec, generation, storage)

	switch (field.kind) {
		case 'string': {
			const fallback = requireDefault(declaredDefault, isString, fieldName)
			const builder = text(fieldName)
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'text')
		}
		case 'enum': {
			const fallback = requireDefault(declaredDefault, isString, fieldName)
			const builder = text(fieldName, { enum: readEnumValues(field) })
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'text')
		}
		case 'int': {
			const autoIncrement = assertScalarAutoIncrement(field, fieldName)
			const fallback = requireDefault(declaredDefault, isNumber, fieldName)
			const builder = bigint(fieldName, { mode: 'number' })
			const generated = autoIncrement
				? builder.generatedByDefaultAsIdentity()
				: builder
			const configured =
				fallback === undefined ? generated : generated.default(fallback)

			return finish(configured, 'bigint')
		}
		case 'bigint': {
			const autoIncrement = assertScalarAutoIncrement(field, fieldName)
			const fallback = requireDefault(declaredDefault, isBigint, fieldName)
			const builder = bigint(fieldName, { mode: 'bigint' })
			const generated = autoIncrement
				? builder.generatedByDefaultAsIdentity()
				: builder
			const configured =
				fallback === undefined ? generated : generated.default(fallback)

			return finish(configured, 'bigint')
		}
		case 'float': {
			const fallback = requireDefault(declaredDefault, isNumber, fieldName)
			const builder = doublePrecision(fieldName)
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'double precision')
		}
		case 'decimal': {
			const fallback = requireDefault(declaredDefault, isString, fieldName)
			const builder = numeric(fieldName, readDecimalConfig(field))
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'numeric')
		}
		case 'boolean': {
			const fallback = requireDefault(declaredDefault, isBoolean, fieldName)
			const builder = boolean(fieldName)
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'boolean')
		}
		case 'binary': {
			const fallback = requireDefault(declaredDefault, isBinary, fieldName)
			const builder = bytea(fieldName)
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'bytea')
		}
		case 'uuid': {
			const fallback = requireDefault(declaredDefault, isString, fieldName)
			const builder = uuid(fieldName)
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'uuid')
		}
		case 'pointer':
			// Referential metadata is attached at table level after every circular target exists.
			return finish(uuid(fieldName), 'uuid')
		case 'date': {
			const fallback = requireDefault(declaredDefault, isString, fieldName)
			const builder = date(fieldName, { mode: 'string' })
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'date')
		}
		case 'time': {
			const fallback = requireDefault(declaredDefault, isString, fieldName)
			const builder = time(fieldName, {
				precision: 3,
				withTimezone: readTimezone(field, false),
			})
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'time')
		}
		case 'dateTime': {
			const fallback = requireDefault(declaredDefault, isString, fieldName)
			const builder = timestamp(fieldName, {
				mode: 'string',
				precision: 3,
				withTimezone: readTimezone(field, true),
			})
			const configured =
				fallback === undefined ? builder : builder.default(fallback)

			return finish(configured, 'timestamp')
		}
		case 'json':
			return compileJsonbBuilder(fieldName, plan, declaredDefault)
		default:
			throw new TypeError(
				`No PostgreSQL field compiler is registered for kind: ${field.kind}`,
			)
	}
}
