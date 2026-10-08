import {
	type FieldDefinition,
	type GenericField,
	type SchemaDefinition,
} from '../../schema/index.js'
import { assertFieldDefinition } from '../../schema/fields/base/definition.js'
import { getFieldListDepth } from '../../schema/fields/base/options.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { assertExactEnumerableKeys } from '../../exact-object-validation.js'

import type { QueryFieldName } from '../ast/contracts.js'
import {
	parsePersistedQueryFieldName,
	readPersistedQueryFields,
} from '../ast/schema.js'
import type { QueryFieldPath } from './primitive.js'

export type RuntimeQueryField = FieldDefinition<string, unknown, object>

export interface ResolvedQueryTarget<TFieldName extends string = string> {
	readonly fieldName: TFieldName
	readonly path: readonly [string, ...string[]] | undefined
	readonly rootField: RuntimeQueryField
	readonly terminalField: RuntimeQueryField | undefined
}

/** Reads declared object children; a map never exposes `Object.prototype` members. */
export const readObjectChildFields = (
	field: RuntimeQueryField,
): ReadonlyMap<string, GenericField> | undefined => {
	if (field.kind !== 'object' || !('fields' in field.options)) return undefined
	if (!isPlainRecord(field.options.fields)) return undefined

	const fields = new Map<string, GenericField>()

	for (const [name, child] of Object.entries(field.options.fields)) {
		assertFieldDefinition(child, `query object field ${name}`)
		fields.set(name, child)
	}

	return fields
}

const fieldPathKeys = new Set(['kind', 'field', 'path'])

const parseFieldPath = (value: unknown): QueryFieldPath | undefined => {
	if (!isPlainRecord(value) || value.kind !== 'field-path') return undefined

	assertExactEnumerableKeys(
		value,
		fieldPathKeys,
		'query field path contains unknown key: ',
	)

	if (typeof value.field !== 'string') {
		throw new TypeError('query field path field must be a string')
	}
	if (!isUnknownArray(value.path) || value.path.length === 0) {
		throw new TypeError('query field path must contain at least one segment')
	}

	const path: string[] = value.path.map((segment, index) => {
		if (typeof segment !== 'string') {
			throw new TypeError(
				`query field path segment[${String(index)}] must be a string`,
			)
		}
		return segment
	})

	return immutableRecord({
		kind: 'field-path',
		field: value.field,
		path: immutableArray(path) as readonly [string, ...string[]],
	})
}

/** Creates one immutable structured path for use as a filter target. */
export const fieldPath = <
	const TFieldName extends string,
	const TPath extends readonly [string, ...string[]],
>(
	field: TFieldName,
	path: TPath,
): QueryFieldPath<TFieldName, TPath> => {
	const parsed = parseFieldPath({ kind: 'field-path', field, path })
	if (parsed === undefined)
		throw new TypeError('query field path must be an object')
	return parsed as QueryFieldPath<TFieldName, TPath>
}

/** Resolves root and nested field ownership for normalized query operators. */
export const resolveQueryTarget = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	target: unknown,
): ResolvedQueryTarget<QueryFieldName<TSchema>> => {
	const parsedPath = parseFieldPath(target)
	const normalizedFieldName = parsePersistedQueryFieldName(
		schema,
		parsedPath?.field ?? target,
		'query filter field',
	)
	const field: RuntimeQueryField | undefined =
		readPersistedQueryFields(schema)[normalizedFieldName]

	if (field === undefined) {
		throw new TypeError('query filter field must reference a field definition')
	}
	if (parsedPath === undefined) {
		return {
			fieldName: normalizedFieldName,
			path: undefined,
			rootField: field,
			terminalField: field,
		}
	}
	if (
		(field.kind !== 'json' && field.kind !== 'object') ||
		getFieldListDepth(field.options) > 0
	) {
		throw new TypeError(
			'query field paths require a non-list json or object root field',
		)
	}

	let terminalField: RuntimeQueryField = field

	for (const [index, segment] of parsedPath.path.entries()) {
		if (terminalField.kind === 'json') {
			return {
				fieldName: normalizedFieldName,
				path: parsedPath.path,
				rootField: field,
				terminalField: undefined,
			}
		}

		const child: GenericField | undefined =
			readObjectChildFields(terminalField)?.get(segment)
		if (child === undefined) {
			throw new TypeError(
				`query field path references unknown object field ${JSON.stringify(segment)} at index ${String(index)}`,
			)
		}

		terminalField = child
		if (
			index < parsedPath.path.length - 1 &&
			getFieldListDepth(child.options) > 0
		) {
			throw new TypeError('query field paths cannot traverse list fields')
		}
	}

	return {
		fieldName: normalizedFieldName,
		path: parsedPath.path,
		rootField: field,
		terminalField,
	}
}
