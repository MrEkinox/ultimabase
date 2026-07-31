import type { BinaryLengthValidationOptions } from './binary-field.js'
import type { BigintRangeValidationOptions } from './bigint-field.js'
import type { DateRangeValidationOptions } from './date-field.js'
import type { DateTimeRangeValidationOptions } from './date-time-field.js'
import type { DecimalRangeValidationOptions } from './decimal-field.js'
import type { DatabaseDefault, DefaultFactory } from './default-value.js'
import type { GenericField } from './field.js'
import type { FloatRangeValidationOptions } from './float-field.js'
import type { IntRangeValidationOptions } from './int-field.js'
import type { StringLengthValidationOptions } from './string-field.js'
import type { TimeRangeValidationOptions } from './time-field.js'
import type { UuidVersion } from './uuid-field.js'

/** Separates create-time presence rules from update-time mutation rules. */
export type ValidationOperation = 'create' | 'update'

/** Describes whether caller input must, may, or must not contain one field. */
export type ValidationPresence = 'forbidden' | 'optional' | 'required'

/** Rejects undeclared properties at every structured object boundary. */
export type UnknownFieldPolicy = 'reject'

/** Keeps issue identifiers stable across transports and localized messages. */
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

/** Reserves namespaced issue identifiers for plugin-owned validation behavior. */
export type PluginValidationIssueCode<
	TFieldKind extends `${string}.${string}` = `${string}.${string}`,
> = `${TFieldKind}.${string}`

export type AnyValidationIssueCode =
	PluginValidationIssueCode | ValidationIssueCode

/** Identifies nested object properties and concrete array offsets. */
export type ValidationIssuePath = readonly (number | string)[]

/** Represents one transport-neutral validation failure. */
export interface ValidationIssue<
	TCode extends AnyValidationIssueCode = ValidationIssueCode,
> {
	readonly code: TCode
	readonly path: ValidationIssuePath
	readonly message: string
}

/** Preserves static data without interpreting it during plan compilation. */
export interface StaticValidationDefaultPlan {
	readonly kind: 'static'
	readonly value: unknown
}

/** Preserves runtime behavior without invoking the developer callback. */
export interface RuntimeValidationDefaultPlan {
	readonly kind: 'runtime'
	readonly factory: DefaultFactory<unknown>
}

/** Defers a temporal default to the operation-scoped runtime clock. */
export interface RuntimeClockValidationDefaultPlan {
	readonly kind: 'runtimeClock'
	readonly value: 'now' | 'today'
}

/** Leaves database-owned default expressions available to adapter plugins. */
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

export interface RegExpValidationPattern {
	readonly source: string
	readonly flags: string
}

export interface StringValidationPlan extends FieldValidationPlanBase<'string'> {
	readonly length?: StringLengthValidationOptions
	readonly match?: RegExpValidationPattern
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

/** Preserves an opaque plugin field until its runtime handler claims it. */
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

/** Represents one operation-specific root input contract. */
export interface SchemaValidationPlan {
	readonly operation: ValidationOperation
	readonly unknownFields: UnknownFieldPolicy
	readonly fields: Readonly<Record<string, FieldValidationPlan>>
}

/** Carries both plans compiled from one immutable schema definition. */
export interface SchemaValidationPlans {
	readonly create: SchemaValidationPlan
	readonly update: SchemaValidationPlan
}
