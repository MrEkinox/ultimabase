import type { SchemaDefinition, SchemaItem } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import {
	readValidationResult,
	runStandardSchema,
	type ValidationIssue,
} from './field-validation.js'
import {
	assertStandardSchema,
	isStandardSchema,
	type FieldStandardSchema,
} from './standard-schema.js'

/** One problem a schema check reports; `path` names the field, from the item. */
export interface SchemaCheckIssue {
	readonly path?: readonly (number | string)[]
	readonly message: string
	readonly code?: string
}

/**
 * What a schema check returns: `true` when the item is valid, otherwise a
 * message, one issue, or several issues (ADR-0319).
 */
export type SchemaCheckResult =
	true | string | SchemaCheckIssue | readonly SchemaCheckIssue[]

/** What a schema check receives: the complete item as it would be stored. */
export interface SchemaCheckInput<TSchema extends SchemaDefinition> {
	readonly item: Readonly<SchemaItem<TSchema>>
}

/**
 * Validates one complete item across its fields (ADR-0319). It runs on every
 * create and update, after field validation; it may be async.
 *
 * @example `({ item }) => item.endsAt > item.startsAt || { path: ['endsAt'], message: 'Ends before it starts' }`
 */
export type SchemaCheck<TSchema extends SchemaDefinition> = (
	input: SchemaCheckInput<TSchema>,
) => MaybePromise<SchemaCheckResult>

/**
 * A schema-level validation: a check function, or a Standard Schema object
 * validator run on the complete item (its output is not stored).
 */
export type SchemaValidation<TSchema extends SchemaDefinition> =
	SchemaCheck<TSchema> | FieldStandardSchema

/** Accepts a check function or a Standard Schema validator at declaration time. */
export const normalizeSchemaValidation = (value: unknown): unknown => {
	if (value === undefined) return undefined
	if (typeof value === 'function' && !isStandardSchema(value)) return value
	assertStandardSchema(value, 'validation')
	return value
}

const readCheckIssue = (
	issue: unknown,
	prefix: readonly (number | string)[],
): ValidationIssue => {
	if (!isPlainRecord(issue) || typeof issue.message !== 'string') {
		throw new TypeError(
			'A schema check must return true, a message, or issues with a message',
		)
	}
	const path = issue.path ?? []
	if (
		!isUnknownArray(path) ||
		!path.every(
			(segment) => typeof segment === 'string' || typeof segment === 'number',
		)
	) {
		throw new TypeError('A schema check issue path must list keys and indexes')
	}
	if (issue.code !== undefined && typeof issue.code !== 'string') {
		throw new TypeError('A schema check issue code must be a string')
	}
	return immutableRecord({
		code: issue.code ?? 'schema.validation',
		message: issue.message,
		path: immutableArray([...prefix, ...path]),
	})
}

/** Runs one schema-level validation over a complete item. */
export const runSchemaValidation = async (
	validation: unknown,
	item: Readonly<Record<string, unknown>>,
	prefix: readonly (number | string)[] = [],
): Promise<readonly ValidationIssue[]> => {
	if (isStandardSchema(validation)) {
		const outcome = await runStandardSchema(
			validation,
			item,
			prefix,
			'schema.validation',
		)
		return outcome.issues
	}
	if (typeof validation !== 'function') return immutableArray([])
	const result: unknown = await Reflect.apply(validation, undefined, [
		immutableRecord({ item }),
	])
	if (isUnknownArray(result)) {
		return immutableArray(result.map((issue) => readCheckIssue(issue, prefix)))
	}
	if (isPlainRecord(result))
		return immutableArray([readCheckIssue(result, prefix)])
	return readValidationResult(result, [...prefix], 'schema.validation')
}
