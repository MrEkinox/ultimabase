import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { BooleanField } from './boolean-field.js'
import type { ArrayField, ObjectField } from './composite-field.js'
import type { DateField, DateRangeValidationOptions } from './date-field.js'
import {
	DatabaseDefault,
	getDefaultKind,
	type DefaultFactory,
} from './default-value.js'
import type { EnumField, EnumValues } from './enum-field.js'
import type { FieldValidationOptions, GenericField } from './field.js'
import type { JsonField } from './json-field.js'
import type {
	NumberField,
	NumberMode,
	NumberRangeValidationOptions,
} from './number-field.js'
import type { SchemaDefinition, SchemaFields } from './schema.js'
import type {
	StringField,
	StringLengthValidationOptions,
} from './string-field.js'
import type { IdSystemField } from './system-field.js'

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
	| 'boolean.type'
	| 'date.invalid'
	| 'date.range.max'
	| 'date.range.min'
	| 'enum.value'
	| 'field.forbidden'
	| 'field.null'
	| 'field.required'
	| 'field.unknown'
	| 'json.type'
	| 'number.finite'
	| 'number.integer'
	| 'number.range.max'
	| 'number.range.min'
	| 'number.type'
	| 'object.type'
	| 'string.length.max'
	| 'string.length.min'
	| 'string.match'
	| 'string.type'
	| 'uuid.type'

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
 * Leaves database-owned default expressions available to adapter plugins.
 */
export interface DatabaseValidationDefaultPlan {
	readonly kind: 'database'
	readonly value: DatabaseDefault<unknown>
}

export type ValidationDefaultPlan =
	| DatabaseValidationDefaultPlan
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

export interface NumberValidationPlan extends FieldValidationPlanBase<'number'> {
	readonly mode: NumberMode
	readonly range?: NumberRangeValidationOptions
	readonly finite?: boolean
}

export type BooleanValidationPlan = FieldValidationPlanBase<'boolean'>

export interface DateValidationPlan extends FieldValidationPlanBase<'date'> {
	readonly range?: DateRangeValidationOptions
}

export interface EnumValidationPlan extends FieldValidationPlanBase<'enum'> {
	readonly values: readonly string[]
}

export type JsonValidationPlan = FieldValidationPlanBase<'json'>

export interface ObjectValidationPlan extends FieldValidationPlanBase<'object'> {
	readonly unknownFields: UnknownFieldPolicy
	readonly fields: Readonly<Record<string, FieldValidationPlan>>
}

export interface ArrayValidationPlan extends FieldValidationPlanBase<'array'> {
	readonly items: FieldValidationPlan
}

export interface UuidValidationPlan extends FieldValidationPlanBase<'uuid'> {
	readonly version: 7
}

export type FieldValidationPlan =
	| ArrayValidationPlan
	| BooleanValidationPlan
	| DateValidationPlan
	| EnumValidationPlan
	| JsonValidationPlan
	| NumberValidationPlan
	| ObjectValidationPlan
	| StringValidationPlan
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
	| ArrayField
	| BooleanField
	| DateField
	| EnumField
	| IdSystemField
	| JsonField
	| NumberField
	| ObjectField
	| StringField

interface FieldPlanBase {
	readonly presence: ValidationPresence
	readonly nullable: boolean
	readonly default?: ValidationDefaultPlan
}

const isBuiltInField = (field: GenericField): field is BuiltInField =>
	field.kind === 'array' ||
	field.kind === 'boolean' ||
	field.kind === 'date' ||
	field.kind === 'enum' ||
	field.kind === 'json' ||
	field.kind === 'number' ||
	field.kind === 'object' ||
	field.kind === 'string' ||
	field.kind === 'uuid'

const isDefaultFactory = (value: unknown): value is DefaultFactory<unknown> =>
	typeof value === 'function'

const compileDefault = (value: unknown): ValidationDefaultPlan => {
	const kind = getDefaultKind(value)

	if (kind === 'runtime' && isDefaultFactory(value)) {
		return immutableRecord({ kind, factory: value })
	}

	if (kind === 'database' && value instanceof DatabaseDefault) {
		return immutableRecord({ kind, value })
	}

	return immutableRecord({ kind: 'static', value })
}

const readPresence = (
	field: BuiltInField,
	operation: ValidationOperation,
	arrayItem: boolean,
): ValidationPresence => {
	if (arrayItem) {
		return 'required'
	}

	const options = field.options
	const generated = 'generatedOn' in options
	const immutable = 'immutable' in options && options.immutable

	if (generated || (operation === 'update' && immutable)) {
		return 'forbidden'
	}

	if (operation === 'update') {
		return 'optional'
	}

	const validation: FieldValidationOptions | undefined = options.validation
	const hasDefault = 'default' in options
	const autoIncremented = 'autoIncrement' in options && options.autoIncrement

	return validation?.required === true && !hasDefault && !autoIncremented
		? 'required'
		: 'optional'
}

const compileFieldPlanBase = (
	field: BuiltInField,
	operation: ValidationOperation,
	arrayItem: boolean,
): FieldPlanBase => {
	const options = field.options
	const presence = readPresence(field, operation, arrayItem)
	const validation: FieldValidationOptions = options.validation ?? {}
	const nullable = validation.nullable === true
	const defaultPlan =
		operation === 'create' &&
		!arrayItem &&
		presence !== 'forbidden' &&
		'default' in options
			? compileDefault(options.default)
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

const compileFields = (
	fields: SchemaFields,
	operation: ValidationOperation,
): Readonly<Record<string, FieldValidationPlan>> => {
	const entries: [string, FieldValidationPlan][] = Object.entries(fields).map(
		([name, field]) => [name, compileField(field, operation, false)],
	)

	return immutableRecord(Object.fromEntries(entries))
}

const compileField = (
	field: GenericField,
	operation: ValidationOperation,
	arrayItem: boolean,
): FieldValidationPlan => {
	if (!isBuiltInField(field)) {
		throw new TypeError(`Unsupported validation field kind: ${field.kind}`)
	}

	const base = compileFieldPlanBase(field, operation, arrayItem)

	switch (field.kind) {
		case 'array':
			return immutableRecord({
				...base,
				kind: field.kind,
				items: compileField(field.options.items, operation, true),
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
		case 'enum':
			return immutableRecord({
				...base,
				kind: field.kind,
				values: compileEnumValues(field),
			})
		case 'json':
			return immutableRecord({ ...base, kind: field.kind })
		case 'number':
			return immutableRecord({
				...base,
				kind: field.kind,
				mode: field.options.mode,
				...(field.options.validation?.range === undefined
					? {}
					: { range: field.options.validation.range }),
				...(field.options.validation?.finite === undefined
					? {}
					: { finite: field.options.validation.finite }),
			})
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
		case 'uuid':
			return immutableRecord({
				...base,
				kind: field.kind,
				version: field.options.uuidVersion,
			})
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
