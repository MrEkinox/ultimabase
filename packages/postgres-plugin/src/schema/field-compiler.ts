import {
	getPluginFieldStorageCodec,
	isFieldRequiredDeferred,
	readPluginFieldStorageDefault,
	type FieldValidationPlan,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import {
	bigint,
	boolean,
	bytea,
	customType,
	date,
	doublePrecision,
	numeric,
	text,
	time,
	timestamp,
	uuid,
	type AnyPgColumnBuilder,
} from 'drizzle-orm/pg-core'

import { toPostgresColumnName } from '../naming.js'
import type {
	PostgresFieldGeneration,
	PostgresStorageKind,
} from './contracts.js'
import {
	createPostgresPointerValueCodec,
	createPostgresValueCodec,
	type PostgresValueCodec,
} from './value-codec.js'

type FieldOptions = Readonly<Record<string, unknown>>

type StaticDefault =
	| { readonly present: false }
	| { readonly present: true; readonly value: unknown }

interface CompiledPostgresFieldBuilder {
	readonly builder: AnyPgColumnBuilder
	readonly generation: PostgresFieldGeneration | undefined
	readonly storage: PostgresStorageKind
}

interface ConfigurableColumnBuilder extends AnyPgColumnBuilder {
	readonly notNull: () => AnyPgColumnBuilder
	readonly primaryKey: () => AnyPgColumnBuilder
}

/** Supplies a resolved target only for a top-level pointer field. */
export interface PostgresPointerCompilerContext {
	readonly target: SchemaDefinition
}

/** Builds one native column whose static default has already been validated. */
interface NativeColumn {
	readonly identity: boolean
	readonly storage: PostgresStorageKind
	readonly build: (
		name: string,
		options: FieldOptions,
		declared: StaticDefault,
		autoIncrement: boolean,
	) => ConfigurableColumnBuilder
}

const hasTrueOption = (options: FieldOptions, name: string): boolean =>
	Object.hasOwn(options, name) && options[name] === true

const nativeColumn = <TValue>(
	storage: PostgresStorageKind,
	accepts: (value: unknown) => value is TValue,
	create: (
		name: string,
		options: FieldOptions,
		autoIncrement: boolean,
	) => ConfigurableColumnBuilder & {
		readonly default: (value: TValue) => ConfigurableColumnBuilder
	},
	identity = false,
): NativeColumn => ({
	identity,
	storage,
	build: (name, options, declared, autoIncrement) => {
		if (!declared.present) {
			return create(name, options, autoIncrement)
		}

		const value = declared.value

		if (!accepts(value)) {
			throw new TypeError(
				`Invalid static default for PostgreSQL field: ${name}`,
			)
		}

		return create(name, options, autoIncrement).default(value)
	},
})

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isBigint = (value: unknown): value is bigint => typeof value === 'bigint'
const isBoolean = (value: unknown): value is boolean =>
	typeof value === 'boolean'
const isBinary = (value: unknown): value is Uint8Array =>
	value instanceof Uint8Array

const readTimezone = (options: FieldOptions, fallback: boolean): boolean =>
	Object.hasOwn(options, 'timezone') ? options.timezone === true : fallback

const readOptionalNumber = (
	options: FieldOptions,
	name: 'precision' | 'scale',
): Readonly<Partial<Record<typeof name, number>>> => {
	const value = Object.hasOwn(options, name) ? options[name] : undefined

	return typeof value === 'number' ? { [name]: value } : {}
}

const readEnumValues = (options: FieldOptions): [string, ...string[]] => {
	const source = Object.hasOwn(options, 'values') ? options.values : undefined
	const values: readonly unknown[] = isUnknownArray(source)
		? source
		: isPlainRecord(source)
			? Object.values(source)
			: []
	const [first, ...rest] = values

	if (
		typeof first !== 'string' ||
		!rest.every((value): value is string => typeof value === 'string')
	) {
		throw new TypeError(
			'PostgreSQL enum fields require non-empty string values',
		)
	}

	return [first, ...rest]
}

const nativeColumns: ReadonlyMap<string, NativeColumn> = new Map([
	['string', nativeColumn('text', isString, (name) => text(name))],
	[
		'enum',
		nativeColumn('text', isString, (name, options) =>
			text(name, { enum: readEnumValues(options) }),
		),
	],
	[
		'int',
		nativeColumn(
			'bigint',
			isNumber,
			(name, _options, autoIncrement) => {
				const builder = bigint(name, { mode: 'number' })

				return autoIncrement ? builder.generatedByDefaultAsIdentity() : builder
			},
			true,
		),
	],
	[
		'bigint',
		nativeColumn(
			'bigint',
			isBigint,
			(name, _options, autoIncrement) => {
				const builder = bigint(name, { mode: 'bigint' })

				return autoIncrement ? builder.generatedByDefaultAsIdentity() : builder
			},
			true,
		),
	],
	[
		'float',
		nativeColumn('double precision', isNumber, (name) => doublePrecision(name)),
	],
	[
		'decimal',
		nativeColumn('numeric', isString, (name, options) =>
			numeric(name, {
				mode: 'string',
				...readOptionalNumber(options, 'precision'),
				...readOptionalNumber(options, 'scale'),
			}),
		),
	],
	['boolean', nativeColumn('boolean', isBoolean, (name) => boolean(name))],
	[
		'binary',
		nativeColumn('bytea', isBinary, (name) => bytea(name).$type<Uint8Array>()),
	],
	['uuid', nativeColumn('uuid', isString, (name) => uuid(name))],
	[
		'date',
		nativeColumn('date', isString, (name) => date(name, { mode: 'string' })),
	],
	[
		'time',
		nativeColumn('time', isString, (name, options) =>
			time(name, { precision: 3, withTimezone: readTimezone(options, false) }),
		),
	],
	[
		'dateTime',
		nativeColumn('timestamp', isString, (name, options) =>
			timestamp(name, {
				mode: 'string',
				precision: 3,
				withTimezone: readTimezone(options, true),
			}),
		),
	],
])

const readFieldOptions = (field: GenericField): FieldOptions => {
	const options: unknown = field.options

	if (!isPlainRecord(options)) {
		throw new TypeError(`Invalid options for PostgreSQL field: ${field.kind}`)
	}

	return options
}

const readGeneration = (
	field: GenericField,
	options: FieldOptions,
): PostgresFieldGeneration | undefined => {
	if (!Object.hasOwn(options, 'generatedOn')) {
		return undefined
	}

	const on = options.generatedOn

	if (on !== 'create' && on !== 'createAndUpdate') {
		throw new TypeError(`Invalid generatedOn metadata for field: ${field.kind}`)
	}

	if (!Object.hasOwn(options, 'uuidVersion')) {
		return immutableRecord({ on })
	}

	if (options.uuidVersion !== 7) {
		throw new TypeError('System UUID fields must use UUID version 7')
	}

	return immutableRecord({ on, uuidVersion: 7 })
}

const finalizeBuilder = (
	builder: ConfigurableColumnBuilder,
	plan: FieldValidationPlan,
	options: FieldOptions,
	fieldName: string,
): AnyPgColumnBuilder => {
	if (
		fieldName === 'id' &&
		hasTrueOption(options, 'system') &&
		plan.field.kind === 'uuid'
	) {
		return builder.primaryKey()
	}

	const notNull =
		!plan.nullable &&
		(plan.presence === 'required' ||
			// A plugin supplies this required value at write time (ADR-0321).
			isFieldRequiredDeferred(plan.field) ||
			Object.hasOwn(options, 'default') ||
			hasTrueOption(options, 'autoNow') ||
			hasTrueOption(options, 'autoIncrement') ||
			Object.hasOwn(options, 'generatedOn'))

	return notNull ? builder.notNull() : builder
}

const createCodecColumnBuilder = (
	columnName: string,
	type: 'jsonb' | 'uuid',
	codec: PostgresValueCodec,
) =>
	customType<{ data: unknown; driverData: unknown }>({
		codec: type,
		dataType: () => type,
		fromDriver: (value: unknown): unknown => codec.decode(value),
		toDriver: (value: unknown): unknown => codec.encode(value),
	})(columnName)

/**
 * Compiles one top-level built-in field into private Drizzle metadata. The
 * column takes the field's `snake_case` name (ADR-0320); the Drizzle table
 * key stays the logical field name.
 */
export const compilePostgresFieldBuilder = (
	fieldName: string,
	plan: FieldValidationPlan,
	pointerContext?: PostgresPointerCompilerContext,
): CompiledPostgresFieldBuilder => {
	const columnName = toPostgresColumnName(fieldName)
	const field = plan.field
	const options = readFieldOptions(field)
	// A plugin field's storage default stays in the table for rows written
	// without it, for example after a schema stops declaring it (ADR-0321).
	const storageDefault = readPluginFieldStorageDefault(field)
	const declared: StaticDefault =
		Object.hasOwn(options, 'default') && typeof options.default !== 'function'
			? { present: true, value: options.default }
			: storageDefault === undefined
				? { present: false }
				: { present: true, value: storageDefault.value }
	const finish = (
		builder: ConfigurableColumnBuilder,
		storage: PostgresStorageKind,
		generation: PostgresFieldGeneration | undefined,
	): CompiledPostgresFieldBuilder => ({
		builder: finalizeBuilder(builder, plan, options, fieldName),
		generation,
		storage,
	})

	if (plan.kind !== 'scalar' && hasTrueOption(options, 'autoIncrement')) {
		throw new TypeError(
			`PostgreSQL autoIncrement is unavailable for JSONB fields: ${fieldName}`,
		)
	}

	if (
		plan.kind !== 'scalar' ||
		field.kind === 'json' ||
		getPluginFieldStorageCodec(field) !== undefined
	) {
		const builder = createCodecColumnBuilder(
			columnName,
			'jsonb',
			createPostgresValueCodec(plan),
		)

		return finish(
			declared.present ? builder.default(declared.value) : builder,
			'jsonb',
			readGeneration(field, options),
		)
	}

	const generation = readGeneration(field, options)

	if (field.kind === 'pointer') {
		if (pointerContext === undefined) {
			throw new TypeError(
				`PostgreSQL pointer target is unavailable: ${fieldName}`,
			)
		}

		// Referential metadata is attached at table level after every circular target exists.
		return finish(
			createCodecColumnBuilder(
				columnName,
				'uuid',
				createPostgresPointerValueCodec(plan, pointerContext.target),
			),
			'uuid',
			generation,
		)
	}

	const column = nativeColumns.get(field.kind)

	if (column === undefined) {
		throw new TypeError(
			`No PostgreSQL field compiler is registered for kind: ${field.kind}`,
		)
	}

	const autoIncrement =
		column.identity && hasTrueOption(options, 'autoIncrement')

	if (autoIncrement && Object.hasOwn(options, 'default')) {
		throw new TypeError(
			`PostgreSQL autoIncrement cannot be combined with default: ${fieldName}`,
		)
	}

	return finish(
		column.build(columnName, options, declared, autoIncrement),
		column.storage,
		generation,
	)
}
