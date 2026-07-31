import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { isBuiltInField, type BuiltInField } from './built-in-field.js'
import {
	DatabaseDefault,
	getDefaultKind,
	type DefaultFactory,
} from './default-value.js'
import { readEnumValues, type EnumField } from './enum-field.js'
import { snapshotDeclaredFieldValue } from './field-definition.js'
import { getFieldListDepth } from './field-options.js'
import { hasValidationFlag, isRequiredOnCreate } from './field-presence.js'
import type { GenericField } from './field.js'
import type { SchemaDefinition, SchemaFields } from './schema.js'
import type { IdSystemField } from './system-field.js'
import type { UuidField, UuidVersion } from './uuid-field.js'

import type {
	ArrayValidationPlan,
	FieldValidationPlan,
	RuntimeClockValidationDefaultPlan,
	SchemaValidationPlan,
	SchemaValidationPlans,
	ValidationDefaultPlan,
	ValidationOperation,
	ValidationPresence,
} from './validation-plan.js'

interface FieldPlanBase {
	readonly presence: ValidationPresence
	readonly nullable: boolean
	readonly default?: ValidationDefaultPlan
}

const isDefaultFactory = (value: unknown): value is DefaultFactory<unknown> =>
	typeof value === 'function'

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

	const staticValue = snapshotDeclaredFieldValue(field, value, 'default')

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

	return isRequiredOnCreate(field) ? 'required' : 'optional'
}

const compileFieldPlanBase = (
	field: GenericField,
	operation: ValidationOperation,
): FieldPlanBase => {
	const options = field.options
	const presence = readPresence(field, operation)
	const nullable = hasValidationFlag(options, 'nullable')
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

const compileEnumValues = (field: EnumField): readonly string[] => {
	return immutableArray(readEnumValues(field.options.values))
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
	const scalarOperation =
		operation === 'update' && listDepth > 0 ? 'create' : operation
	const scalarPlan = isBuiltInField(field)
		? compileScalarField(field, scalarOperation, scalarBase)
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
		case 'string': {
			const match = field.options.validation?.match

			return immutableRecord({
				...base,
				kind: field.kind,
				...(field.options.validation?.length === undefined
					? {}
					: { length: field.options.validation.length }),
				...(match === undefined
					? {}
					: {
							match: immutableRecord({
								source: match.source,
								flags: match.flags,
							}),
						}),
			})
		}
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
