import { immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import {
	hasForbiddenMutationInput,
	isFieldRequiredDeferred,
} from '../fields/base/definition.js'
import {
	getFieldListDepth,
	isFieldNullable,
	isRequiredOnCreate,
} from '../fields/base/options.js'
import type { ObjectField } from '../fields/builtins/object.js'
import type { SchemaDefinition, SchemaFields } from '../schema/definition.js'

import type {
	FieldValidationPlan,
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
	if (
		field.kind === 'relation' ||
		hasForbiddenMutationInput(field) ||
		'generatedOn' in field.options
	) {
		return 'forbidden'
	}

	if (operation === 'update') {
		return 'immutable' in field.options && field.options.immutable
			? 'forbidden'
			: 'optional'
	}

	return !isFieldRequiredDeferred(field) && isRequiredOnCreate(field)
		? 'required'
		: 'optional'
}

/** Narrows the only built-in kind whose plan requires recursive children. */
const isObjectField = (field: GenericField): field is ObjectField =>
	field.kind === 'object'

const compileFields = (
	fields: SchemaFields,
	operation: ValidationOperation,
): Readonly<Record<string, FieldValidationPlan>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(fields).map(([name, field]) => [
				name,
				compileFieldValidationPlan(field, operation),
			]),
		),
	)

/** Compiles one standalone field for protected adapter-owned record protocols. */
export const compileFieldValidationPlan = (
	field: GenericField,
	operation: ValidationOperation,
): FieldValidationPlan => {
	const listDepth = getFieldListDepth(field.options)
	const base: FieldPlanBase = {
		presence: readPresence(field, operation),
		nullable: isFieldNullable(field),
	}
	// List items are always present and non-null, and an update replaces them whole.
	const itemBase: FieldPlanBase =
		listDepth === 0 ? base : { presence: 'required', nullable: false }
	const itemOperation = listDepth === 0 ? operation : 'create'
	let plan: FieldValidationPlan = isObjectField(field)
		? immutableRecord({
				...itemBase,
				field,
				kind: 'object',
				unknownFields: 'reject',
				fields: compileFields(field.options.fields, itemOperation),
			})
		: immutableRecord({ ...itemBase, field, kind: 'scalar' })

	// Wrappers are built inside-out so only the outer field owns property presence.
	for (let level = listDepth; level >= 1; level -= 1) {
		plan = immutableRecord({
			...(level === 1 ? base : itemBase),
			field,
			kind: 'array',
			items: plan,
		})
	}

	return plan
}

/**
 * Compiles immutable operation structure while reusing declared field metadata.
 */
export const compileValidationPlans = (
	schema: SchemaDefinition,
): SchemaValidationPlans => {
	// Compilation deliberately crosses from class identity to neutral metadata once.
	const { persistedFields } = schema.definition
	const compileOperation = (
		operation: ValidationOperation,
	): SchemaValidationPlan =>
		immutableRecord({
			operation,
			unknownFields: 'reject',
			fields: compileFields(persistedFields, operation),
		})

	return immutableRecord({
		create: compileOperation('create'),
		update: compileOperation('update'),
	})
}
