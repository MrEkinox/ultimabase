import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	snapshotBinaryValue,
	type BinaryField,
	type BinaryLengthValidationOptions,
} from './binary-field.js'
import type {
	BigintField,
	BigintRangeValidationOptions,
} from './bigint-field.js'
import type { BooleanField } from './boolean-field.js'
import type { DateField, DateRangeValidationOptions } from './date-field.js'
import type {
	DateTimeField,
	DateTimeRangeValidationOptions,
} from './date-time-field.js'
import type {
	DecimalField,
	DecimalRangeValidationOptions,
} from './decimal-field.js'
import {
	DatabaseDefault,
	getDefaultKind,
	type DefaultFactory,
} from './default-value.js'
import type { EnumField, EnumValues } from './enum-field.js'
import { getFieldListDepth, snapshotFieldValue } from './field-options.js'
import type { GenericField } from './field.js'
import type { FloatField, FloatRangeValidationOptions } from './float-field.js'
import type { IntField, IntRangeValidationOptions } from './int-field.js'
import type { JsonField } from './json-field.js'
import type { ObjectField } from './object-field.js'
import type { SchemaDefinition, SchemaFields } from './schema.js'
import type {
	StringField,
	StringLengthValidationOptions,
} from './string-field.js'
import type { IdSystemField } from './system-field.js'
import type { TimeField, TimeRangeValidationOptions } from './time-field.js'
import type { UuidField, UuidVersion } from './uuid-field.js'

/**
 * Separates create-time presence rules from update-time mutation rules.
 */
export type ValidationOperation = 'create' | 'update'

/**
 * Describes whether caller input must, may, or must not contain one field.
 */
export type ValidationPresence = 'forbidden' | 'optional' | 'required'

/**
 * Rejects undeclared properties at every structured object boundary.
 */
export type UnknownFieldPolicy = 'reject'

/**
 * Keeps issue identifiers stable across transports and localized messages.
 */
export type ValidationIssueCode =
	| 'array.type'
	| 'bigint.range.max'
	| 'bigint.range.min'
	| 'bigint.type'
	| 'binary.length.max'
	| 'binary.length.min'
	| 'binary.type'
	| 'boolean.type'
	| 'date.invalid'
	| 'date.range.max'
	| 'date.range.min'
	| 'dateTime.invalid'
	| 'dateTime.range.max'
	| 'dateTime.range.min'
	| 'decimal.invalid'
	| 'decimal.precision'
	| 'decimal.range.max'
	| 'decimal.range.min'
	| 'decimal.scale'
	| 'enum.value'
	| 'field.forbidden'
	| 'field.null'
	| 'field.required'
	| 'field.unknown'
	| 'json.type'
	| 'float.finite'
	| 'float.range.max'
	| 'float.range.min'
	| 'float.type'
	| 'int.range.max'
	| 'int.range.min'
	| 'int.type'
	| 'object.type'
	| 'string.length.max'
	| 'string.length.min'
	| 'string.match'
	| 'string.type'
	| 'time.invalid'
	| 'time.range.max'
	| 'time.range.min'
	| 'uuid.type'
	| 'uuid.version'

/**
 * Identifies nested object properties and concrete array offsets.
 */
export type ValidationIssuePath = readonly (number | string)[]

/**
 * Represents one transport-neutral validation failure.
 */
export interface ValidationIssue {
	readonly code: ValidationIssueCode
	readonly path: ValidationIssuePath
	readonly message: string
}

/**
 * Preserves static data without interpreting it during plan compilation.
 */
export interface StaticValidationDefaultPlan {
	readonly kind: 'static'
	readonly value: unknown
}

/**
 * Preserves runtime behavior without invoking the developer callback.
 */
export interface RuntimeValidationDefaultPlan {
	readonly kind: 'runtime'
	readonly factory: DefaultFactory<unknown>
}

/**
 * Defers a temporal default to the operation-scoped runtime clock.
 */
export interface RuntimeClockValidationDefaultPlan {
	readonly kind: 'runtimeClock'
	readonly value: 'now' | 'today'
}

/**
 * Leaves database-owned default expressions available to adapter plugins.
 */
export interface DatabaseValidationDefaultPlan {
	readonly kind: 'database'
	readonly value: DatabaseDefault<unknown>
}

export type ValidationDefaultPlan =
	| DatabaseValidationDefaultPlan
	| RuntimeClockValidationDefaultPlan
	| RuntimeValidationDefaultPlan
	| StaticValidationDefaultPlan

interface FieldValidationPlanBase<TKind extends string> {
	readonly kind: TKind
	readonly presence: ValidationPresence
	readonly nullable: boolean
	readonly default?: ValidationDefaultPlan
}

export interface StringValidationPlan extends FieldValidationPlanBase<'string'> {
	readonly length?: StringLengthValidationOptions
	readonly match?: RegExp
}

export interface BigintValidationPlan extends FieldValidationPlanBase<'bigint'> {
	readonly range?: BigintRangeValidationOptions
}

export interface BinaryValidationPlan extends FieldValidationPlanBase<'binary'> {
	readonly length?: BinaryLengthValidationOptions
}

export interface IntValidationPlan extends FieldValidationPlanBase<'int'> {
	readonly range?: IntRangeValidationOptions
}

export interface FloatValidationPlan extends FieldValidationPlanBase<'float'> {
	readonly range?: FloatRangeValidationOptions
	readonly finite?: boolean
}

export type BooleanValidationPlan = FieldValidationPlanBase<'boolean'>

export interface DateValidationPlan extends FieldValidationPlanBase<'date'> {
	readonly range?: DateRangeValidationOptions
}

export interface DateTimeValidationPlan extends FieldValidationPlanBase<'dateTime'> {
	readonly timezone: boolean
	readonly range?: DateTimeRangeValidationOptions
}

export interface DecimalValidationPlan extends FieldValidationPlanBase<'decimal'> {
	readonly precision?: number
	readonly scale?: number
	readonly range?: DecimalRangeValidationOptions
}

export interface EnumValidationPlan extends FieldValidationPlanBase<'enum'> {
	readonly values: readonly string[]
}

export type JsonValidationPlan = FieldValidationPlanBase<'json'>

export interface TimeValidationPlan extends FieldValidationPlanBase<'time'> {
	readonly timezone: boolean
	readonly range?: TimeRangeValidationOptions
}

export interface ObjectValidationPlan extends FieldValidationPlanBase<'object'> {
	readonly unknownFields: UnknownFieldPolicy
	readonly fields: Readonly<Record<string, FieldValidationPlan>>
}

/**
 * Preserves an opaque plugin field until its associated runtime handler claims it.
 */
export interface PluginFieldValidationPlan<
	TFieldKind extends string = string,
	TField extends GenericField = GenericField,
> extends FieldValidationPlanBase<'plugin'> {
	readonly fieldKind: TFieldKind
	readonly field: TField
}

export interface ArrayValidationPlan extends FieldValidationPlanBase<'array'> {
	readonly items: FieldValidationPlan
}

export interface UuidValidationPlan extends FieldValidationPlanBase<'uuid'> {
	readonly version?: UuidVersion
}

export type FieldValidationPlan =
	| ArrayValidationPlan
	| BigintValidationPlan
	| BinaryValidationPlan
	| BooleanValidationPlan
	| DateValidationPlan
	| DateTimeValidationPlan
	| DecimalValidationPlan
	| EnumValidationPlan
	| FloatValidationPlan
	| IntValidationPlan
	| JsonValidationPlan
	| ObjectValidationPlan
	| PluginFieldValidationPlan
	| StringValidationPlan
	| TimeValidationPlan
	| UuidValidationPlan

/**
 * Represents one operation-specific root input contract.
 */
export interface SchemaValidationPlan {
	readonly operation: ValidationOperation
	readonly unknownFields: UnknownFieldPolicy
	readonly fields: Readonly<Record<string, FieldValidationPlan>>
}

/**
 * Carries both plans compiled from one immutable schema definition.
 */
export interface SchemaValidationPlans {
	readonly create: SchemaValidationPlan
	readonly update: SchemaValidationPlan
}

type BuiltInField =
	| BigintField
	| BinaryField
	| BooleanField
	| DateField
	| DateTimeField
	| DecimalField
	| EnumField
	| FloatField
	| IdSystemField
	| IntField
	| JsonField
	| ObjectField
	| StringField
	| TimeField
	| UuidField

interface FieldPlanBase {
	readonly presence: ValidationPresence
	readonly nullable: boolean
	readonly default?: ValidationDefaultPlan
}

const isBuiltInField = (field: GenericField): field is BuiltInField =>
	field.kind === 'bigint' ||
	field.kind === 'binary' ||
	field.kind === 'boolean' ||
	field.kind === 'date' ||
	field.kind === 'dateTime' ||
	field.kind === 'decimal' ||
	field.kind === 'enum' ||
	field.kind === 'float' ||
	field.kind === 'int' ||
	field.kind === 'json' ||
	field.kind === 'object' ||
	field.kind === 'string' ||
	field.kind === 'time' ||
	field.kind === 'uuid'

const isDefaultFactory = (value: unknown): value is DefaultFactory<unknown> =>
	typeof value === 'function'

const isValidationFlagEnabled = (
	options: object,
	flag: 'nullable' | 'required',
): boolean => {
	if (
		!('validation' in options) ||
		typeof options.validation !== 'object' ||
		options.validation === null
	) {
		return false
	}

	// Explicit branches retain safe property narrowing without a broad record cast.
	return flag === 'nullable'
		? 'nullable' in options.validation && options.validation.nullable === true
		: 'required' in options.validation && options.validation.required === true
}

const readRuntimeClockDefault = (
	field: GenericField,
	value: unknown,
): RuntimeClockValidationDefaultPlan | undefined => {
	const isToday = field.kind === 'date' && value === 'today'
	const isNow =
		(field.kind === 'dateTime' || field.kind === 'time') && value === 'now'

	return isToday || isNow
		? immutableRecord({ kind: 'runtimeClock', value })
		: undefined
}

const compileDefault = (
	field: GenericField,
	value: unknown,
): ValidationDefaultPlan => {
	const runtimeClockDefault = readRuntimeClockDefault(field, value)

	if (runtimeClockDefault !== undefined) {
		return runtimeClockDefault
	}

	const kind = getDefaultKind(value)

	if (kind === 'runtime' && isDefaultFactory(value)) {
		return immutableRecord({ kind, factory: value })
	}

	if (kind === 'database' && value instanceof DatabaseDefault) {
		return immutableRecord({ kind, value })
	}

	const staticValue =
		field.kind === 'binary'
			? snapshotFieldValue(
					value,
					getFieldListDepth(field.options),
					snapshotBinaryValue,
					'default',
				)
			: value

	return immutableRecord({ kind: 'static', value: staticValue })
}

const readPresence = (
	field: GenericField,
	operation: ValidationOperation,
): ValidationPresence => {
	const options = field.options
	const generated = 'generatedOn' in options
	const immutable = 'immutable' in options && options.immutable

	if (generated || (operation === 'update' && immutable)) {
		return 'forbidden'
	}

	if (operation === 'update') {
		return 'optional'
	}

	const hasDefault = 'default' in options
	const autoIncremented = 'autoIncrement' in options && options.autoIncrement

	return isValidationFlagEnabled(options, 'required') &&
		!hasDefault &&
		!autoIncremented
		? 'required'
		: 'optional'
}

const compileFieldPlanBase = (
	field: GenericField,
	operation: ValidationOperation,
): FieldPlanBase => {
	const options = field.options
	const presence = readPresence(field, operation)
	const nullable = isValidationFlagEnabled(options, 'nullable')
	const defaultPlan =
		operation === 'create' && presence !== 'forbidden' && 'default' in options
			? compileDefault(field, options.default)
			: undefined

	return immutableRecord({
		presence,
		nullable,
		...(defaultPlan === undefined ? {} : { default: defaultPlan }),
	})
}

const isEnumValueList = (values: EnumValues): values is readonly string[] =>
	Array.isArray(values)

const compileEnumValues = (field: EnumField): readonly string[] => {
	const { values } = field.options
	const normalizedValues: readonly string[] = isEnumValueList(values)
		? values
		: Object.values(values)

	return immutableArray(normalizedValues)
}

const readUuidVersion = (
	field: IdSystemField | UuidField,
): UuidVersion | undefined => {
	const { options } = field

	// System generation metadata and developer validation share one plan shape.
	return 'uuidVersion' in options
		? options.uuidVersion
		: options.validation?.version
}

const compileFields = (
	fields: SchemaFields,
	operation: ValidationOperation,
): Readonly<Record<string, FieldValidationPlan>> => {
	const entries: [string, FieldValidationPlan][] = Object.entries(fields).map(
		([name, field]) => [name, compileField(field, operation)],
	)

	return immutableRecord(Object.fromEntries(entries))
}

const compileField = (
	field: GenericField,
	operation: ValidationOperation,
): FieldValidationPlan => {
	const base = compileFieldPlanBase(field, operation)
	const listDepth = getFieldListDepth(field.options)
	const scalarBase =
		listDepth === 0
			? base
			: immutableRecord({
					presence: 'required',
					nullable: false,
				} satisfies FieldPlanBase)
	const scalarPlan = isBuiltInField(field)
		? compileScalarField(field, operation, scalarBase)
		: immutableRecord({
				...scalarBase,
				kind: 'plugin',
				fieldKind: field.kind,
				field,
			})

	if (listDepth === 0) {
		return scalarPlan
	}

	let plan: FieldValidationPlan = scalarPlan

	// Wrappers are built inside-out so only the outer field owns presence and defaults.
	for (let level = listDepth; level >= 1; level -= 1) {
		const wrapperBase = level === 1 ? base : scalarBase

		plan = immutableRecord({
			...wrapperBase,
			kind: 'array',
			items: plan,
		})
	}

	return plan
}

const compileScalarField = (
	field: BuiltInField,
	operation: ValidationOperation,
	base: FieldPlanBase,
): Exclude<FieldValidationPlan, ArrayValidationPlan> => {
	switch (field.kind) {
		case 'bigint':
			return immutableRecord({
				...base,
				kind: field.kind,
				...(field.options.validation?.range === undefined
					? {}
					: { range: field.options.validation.range }),
			})
		case 'binary':
			return immutableRecord({
				...base,
				kind: field.kind,
				...(field.options.validation?.length === undefined
					? {}
					: { length: field.options.validation.length }),
			})
		case 'boolean':
			return immutableRecord({ ...base, kind: field.kind })
		case 'date':
			return immutableRecord({
				...base,
				kind: field.kind,
				...(field.options.validation?.range === undefined
					? {}
					: { range: field.options.validation.range }),
			})
		case 'dateTime':
			return immutableRecord({
				...base,
				kind: field.kind,
				timezone: field.options.timezone ?? true,
				...(field.options.validation?.range === undefined
					? {}
					: { range: field.options.validation.range }),
			})
		case 'decimal':
			return immutableRecord({
				...base,
				kind: field.kind,
				...(field.options.validation?.precision === undefined
					? {}
					: { precision: field.options.validation.precision }),
				...(field.options.validation?.scale === undefined
					? {}
					: { scale: field.options.validation.scale }),
				...(field.options.validation?.range === undefined
					? {}
					: { range: field.options.validation.range }),
			})
		case 'enum':
			return immutableRecord({
				...base,
				kind: field.kind,
				values: compileEnumValues(field),
			})
		case 'float':
			return immutableRecord({
				...base,
				kind: field.kind,
				...(field.options.validation?.range === undefined
					? {}
					: { range: field.options.validation.range }),
				...(field.options.validation?.finite === undefined
					? {}
					: { finite: field.options.validation.finite }),
			})
		case 'int':
			return immutableRecord({
				...base,
				kind: field.kind,
				...(field.options.validation?.range === undefined
					? {}
					: { range: field.options.validation.range }),
			})
		case 'json':
			return immutableRecord({ ...base, kind: field.kind })
		case 'object':
			return immutableRecord({
				...base,
				kind: field.kind,
				unknownFields: 'reject',
				fields: compileFields(field.options.fields, operation),
			})
		case 'string':
			return immutableRecord({
				...base,
				kind: field.kind,
				...(field.options.validation?.length === undefined
					? {}
					: { length: field.options.validation.length }),
				...(field.options.validation?.match === undefined
					? {}
					: { match: field.options.validation.match }),
			})
		case 'time':
			return immutableRecord({
				...base,
				kind: field.kind,
				timezone: field.options.timezone ?? false,
				...(field.options.validation?.range === undefined
					? {}
					: { range: field.options.validation.range }),
			})
		case 'uuid': {
			const version = readUuidVersion(field)

			return immutableRecord({
				...base,
				kind: field.kind,
				...(version === undefined ? {} : { version }),
			})
		}
	}
}

const compileOperationPlan = (
	schema: SchemaDefinition,
	operation: ValidationOperation,
): SchemaValidationPlan =>
	immutableRecord({
		operation,
		unknownFields: 'reject',
		fields: compileFields(schema.fields, operation),
	})

/**
 * Compiles immutable create and update plans without executing validation behavior.
 */
export const compileValidationPlans = (
	schema: SchemaDefinition,
): SchemaValidationPlans =>
	immutableRecord({
		create: compileOperationPlan(schema, 'create'),
		update: compileOperationPlan(schema, 'update'),
	})
