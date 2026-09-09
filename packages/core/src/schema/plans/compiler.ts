import { immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import { isFieldRequiredDeferred } from '../fields/base/definition.js'
import {
	getFieldListDepth,
	isFieldNullable,
	isRequiredOnCreate,
} from '../fields/base/options.js'
import type { ObjectField } from '../fields/builtins/object.js'
import type {
	SchemaDefinition,
	SchemaFields,
	SchemaMetadata,
} from '../schema/definition.js'

import type {
	FieldValidationPlan,
	ObjectValidationPlan,
	ScalarValidationPlan,
	SchemaValidationPlan,
	SchemaValidationPlans,
	ValidationOperation,
	ValidationPresence,
} from './contracts.js'

interface FieldPlanBase {
	readonly presence: ValidationPresence
	readonly nullable: boolean
}

const readPresence = (
	field: GenericField,
	operation: ValidationOperation,
): ValidationPresence => {
	// Relation collections are addressed through handles and never cross row inputs.
	if (field.kind === 'relation') return 'forbidden'

	const options = field.options
	const generated = 'generatedOn' in options
	const immutable = 'immutable' in options && options.immutable

	if (generated || (operation === 'update' && immutable)) {
		return 'forbidden'
	}

	if (operation === 'update') {
		return 'optional'
	}

	if (isFieldRequiredDeferred(field)) {
		return 'optional'
	}

	return isRequiredOnCreate(field) ? 'required' : 'optional'
}

const compileFieldPlanBase = (
	field: GenericField,
	operation: ValidationOperation,
): FieldPlanBase => ({
	presence: readPresence(field, operation),
	nullable: isFieldNullable(field),
})

/** Narrows the only built-in kind whose plan requires recursive children. */
const isObjectField = (field: GenericField): field is ObjectField =>
	field.kind === 'object'

const compileFields = (
	fields: SchemaFields,
	operation: ValidationOperation,
): Readonly<Record<string, FieldValidationPlan>> => {
	const entries: [string, FieldValidationPlan][] = Object.entries(fields).map(
		([name, field]) => [name, compileField(field, operation)],
	)

	return immutableRecord(Object.fromEntries(entries))
}

const compileScalarOrObject = (
	field: GenericField,
	operation: ValidationOperation,
	base: FieldPlanBase,
): ObjectValidationPlan | ScalarValidationPlan => {
	if (isObjectField(field)) {
		return immutableRecord({
			...base,
			field,
			kind: 'object',
			unknownFields: 'reject',
			fields: compileFields(field.options.fields, operation),
		})
	}

	return immutableRecord({ ...base, field, kind: 'scalar' })
}

const compileField = (
	field: GenericField,
	operation: ValidationOperation,
): FieldValidationPlan => {
	const base = compileFieldPlanBase(field, operation)
	const listDepth = getFieldListDepth(field.options)
	const scalarBase: FieldPlanBase =
		listDepth === 0
			? base
			: {
					presence: 'required',
					nullable: false,
				}
	const scalarOperation =
		operation === 'update' && listDepth > 0 ? 'create' : operation
	const scalarPlan = compileScalarOrObject(field, scalarOperation, scalarBase)

	if (listDepth === 0) {
		return scalarPlan
	}

	let plan: FieldValidationPlan = scalarPlan

	// Wrappers are built inside-out so only the outer field owns property presence.
	for (let level = listDepth; level >= 1; level -= 1) {
		const wrapperBase = level === 1 ? base : scalarBase

		plan = immutableRecord({
			...wrapperBase,
			field,
			kind: 'array',
			items: plan,
		})
	}

	return plan
}

/** Compiles one standalone field for protected adapter-owned record protocols. */
export const compileFieldValidationPlan = (
	field: GenericField,
	operation: ValidationOperation,
): FieldValidationPlan => compileField(field, operation)

const compileOperationPlan = (
	schema: SchemaMetadata,
	operation: ValidationOperation,
): SchemaValidationPlan =>
	immutableRecord({
		operation,
		unknownFields: 'reject',
		fields: compileFields(schema.persistedFields, operation),
	})

/**
 * Compiles immutable operation structure while reusing declared field metadata.
 */
export const compileValidationPlans = (
	schema: SchemaDefinition,
): SchemaValidationPlans => {
	// Compilation deliberately crosses from class identity to neutral metadata once.
	const definition = schema.definition

	return immutableRecord({
		create: compileOperationPlan(definition, 'create'),
		update: compileOperationPlan(definition, 'update'),
	})
}
