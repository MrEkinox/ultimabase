import { isPlainRecord } from '@ultimabase/shared'

import type { GenericField } from '../../schema/fields/base/contract.js'
import { assertFieldDefinition } from '../../schema/fields/base/definition.js'
import { getRelationWhereDeclaration } from '../../schema/fields/builtins/relation.js'
import type { CompiledSchemaRegistry } from '../../schema/schema/registry.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type { QueryFilterNode } from './logical.js'
import {
	normalizeWhereInput,
	resolveWhereInput,
	WhereBuilder,
	type WhereInput,
} from './where.js'

const compiledStaticRelationWhere = new WeakMap<
	object,
	QueryFilterNode<SchemaDefinition>
>()

const readFieldAtPath = (
	schema: SchemaDefinition,
	fieldPath: readonly string[],
): GenericField => {
	let fields: Readonly<Record<string, unknown>> = schema.persistedFields
	let field: GenericField | undefined

	for (const [index, name] of fieldPath.entries()) {
		const candidate = fields[name]
		assertFieldDefinition(
			candidate,
			`${schema.className}.${fieldPath.join('.')}`,
		)
		field = candidate

		if (index === fieldPath.length - 1) break
		const nestedFields: unknown = Reflect.get(candidate.options, 'fields')
		if (!isPlainRecord(nestedFields)) {
			throw new TypeError(
				`${schema.className}.${fieldPath.join('.')} has no nested field map`,
			)
		}
		fields = nestedFields
	}

	if (field === undefined) {
		throw new TypeError(
			`${schema.className} relation field path must not be empty`,
		)
	}

	return field
}

/**
 * Validates every static relation filter only after its exact target resolves.
 * Contextual callbacks remain private and are deliberately not invoked here.
 */
export const compileStaticRelationWhereDeclarations = (
	schemas: CompiledSchemaRegistry,
): void => {
	for (const target of schemas.schemaTargets.values()) {
		const field = readFieldAtPath(target.source, target.fieldPath)
		if (field.kind !== 'relation') continue

		const declaration = getRelationWhereDeclaration(field)
		if (declaration?.kind !== 'static') continue

		const expression = normalizeWhereInput(target.target, declaration.input)
		compiledStaticRelationWhere.set(field, expression)
	}
}

/** @internal Reads one normalized callback-free filter for future Runtime use. */
export const getCompiledStaticRelationWhere = (
	field: GenericField,
): QueryFilterNode<SchemaDefinition> | undefined =>
	compiledStaticRelationWhere.get(field)

const isPromiseLike = (value: unknown): boolean => {
	if (
		(typeof value !== 'object' || value === null) &&
		typeof value !== 'function'
	) {
		return false
	}

	return typeof Reflect.get(value, 'then') === 'function'
}

/** @internal Validates one contextual result before a Runtime request can run. */
export const normalizeContextualRelationWhereResult = (
	target: SchemaDefinition,
	result: unknown,
): QueryFilterNode<SchemaDefinition> => {
	if (isPromiseLike(result)) {
		throw new TypeError('relation where resolver must return synchronously')
	}

	if (result instanceof WhereBuilder) {
		return resolveWhereInput(target, result)
	}

	if (!isPlainRecord(result)) {
		throw new TypeError(
			'relation where resolver must return a WhereInput or WhereBuilder',
		)
	}

	return normalizeWhereInput(target, result as WhereInput<SchemaDefinition>)
}
