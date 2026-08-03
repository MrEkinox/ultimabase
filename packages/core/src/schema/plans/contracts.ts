import type { GenericField } from '../fields/base/contract.js'
import type { ObjectField } from '../fields/builtins/object.js'

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
	| 'upsert.target'
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

interface FieldValidationPlanBase<
	TKind extends string,
	TField extends GenericField,
> {
	readonly kind: TKind
	readonly field: TField
	readonly presence: ValidationPresence
	readonly nullable: boolean
}

/** Reuses one declared scalar field instead of duplicating its validation metadata. */
export type ScalarValidationPlan<TField extends GenericField = GenericField> =
	FieldValidationPlanBase<'scalar', TField>

/** Adds operation-specific children only where object update semantics require them. */
export interface ObjectValidationPlan<
	TField extends ObjectField = ObjectField,
> extends FieldValidationPlanBase<'object', TField> {
	readonly unknownFields: UnknownFieldPolicy
	readonly fields: Readonly<Record<string, FieldValidationPlan>>
}

/** Represents one list dimension while retaining the original declared field. */
export interface ArrayValidationPlan<
	TField extends GenericField = GenericField,
> extends FieldValidationPlanBase<'array', TField> {
	readonly items: FieldValidationPlan
}

export type FieldValidationPlan =
	ArrayValidationPlan | ObjectValidationPlan | ScalarValidationPlan

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
