import {
	getFieldSchemaTarget,
	normalizeReadOperation,
	type ApplicationRequestExecutor,
	type OperationResult,
	type ReadOperationAstForKind,
	type ReadOperationKind,
	type RequestContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { invalidRestRead, RestReadNormalizationError } from './errors.js'
import { decodeRestWhere, isUuidV7 } from './field-values.js'
import { readRestJsonBody } from './read-body.js'
import { decodeRestAfterCursor, isRestPositionError } from './read-cursors.js'
import {
	parseJson,
	parseNonNegativeInteger,
	parseOrdering,
	parseRestIncludeParameter,
	parseRestQueryEntries,
	parseRestSelectionParameter,
} from './read-parameters.js'

export {
	parseRestIncludeParameter,
	parseRestQueryEntries,
	parseRestSelectionParameter,
} from './read-parameters.js'

export const defaultRestReadLimits: Readonly<{
	readonly bodyBytes: 1_048_576
	readonly defaultTake: 100
	readonly maxTake: 1000
}> = immutableRecord({
	bodyBytes: 1_048_576,
	defaultTake: 100,
	maxTake: 1000,
} as const)

/** Bounds one REST request: body size and the collection `take` window. */
export interface RestReadLimits {
	readonly bodyBytes: number
	/** `take` of a collection read that omits it (ADR-0309). */
	readonly defaultTake: number
	/** Largest accepted `take`; a larger one is `REST_READ_INVALID_INPUT`. */
	readonly maxTake: number
}

export type RestReadOperation = 'count' | 'exists' | 'find' | 'first' | 'get'

type CoreReadKindFor<TOperation extends RestReadOperation> =
	TOperation extends 'find'
		? 'find-many'
		: TOperation extends 'first'
			? 'find-one'
			: TOperation

/** Resolves the exact Core AST produced by one REST read operation. */
export type RestReadOperationAst<
	TSchema extends SchemaDefinition,
	TOperation extends RestReadOperation,
> = ReadOperationAstForKind<TSchema, CoreReadKindFor<TOperation>>

export type RestReadRequest =
	| Readonly<{
			readonly operation: Exclude<RestReadOperation, 'get'>
			readonly request: Request
	  }>
	| Readonly<{
			readonly id: string
			readonly operation: 'get'
			readonly request: Request
	  }>

const readOperationKinds: Readonly<
	Record<RestReadOperation, ReadOperationKind>
> = immutableRecord({
	count: 'count',
	exists: 'exists',
	find: 'find-many',
	first: 'find-one',
	get: 'get',
})

const getQueryKeys: Readonly<Record<RestReadOperation, readonly string[]>> =
	immutableRecord({
		count: ['where'],
		exists: ['where'],
		find: ['after', 'include', 'orderBy', 'select', 'skip', 'take', 'where'],
		first: ['include', 'orderBy', 'select', 'where'],
		get: ['include', 'select'],
	})

/** @internal Rejects limits that cannot bound a request before any parsing. */
export const normalizeRestLimits = (
	limits: RestReadLimits,
	boundary: 'mutation' | 'read',
): RestReadLimits => {
	if (
		!Number.isSafeInteger(limits.bodyBytes) ||
		limits.bodyBytes < 1 ||
		!Number.isSafeInteger(limits.defaultTake) ||
		limits.defaultTake < 1 ||
		!Number.isSafeInteger(limits.maxTake) ||
		limits.maxTake < 1
	) {
		throw new TypeError(
			`REST ${boundary} limits must be positive safe integers`,
		)
	}
	if (limits.defaultTake > limits.maxTake) {
		throw new TypeError(
			`REST ${boundary} limits defaultTake must not exceed maxTake`,
		)
	}
	return immutableRecord(limits)
}

const parseGetInput = (
	request: Request,
	operation: RestReadOperation,
): Readonly<Record<string, unknown>> => {
	const result: Record<string, unknown> = {}
	for (const [name, value] of parseRestQueryEntries(request)) {
		if (
			!getQueryKeys[operation].includes(name) ||
			Object.hasOwn(result, name)
		) {
			throw invalidRestRead()
		}
		result[name] =
			name === 'where'
				? parseJson(value)
				: name === 'select'
					? parseRestSelectionParameter(value)
					: name === 'include'
						? parseRestIncludeParameter(value)
						: name === 'orderBy'
							? parseOrdering(value)
							: name === 'after'
								? value
								: parseNonNegativeInteger(value)
	}
	return immutableRecord(result)
}

/** @internal Applies field codecs and limits to every included relationship. */
export const decodeRestInclude = (
	schema: SchemaDefinition,
	value: unknown,
	limits: RestReadLimits,
): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, targetInput]) => {
				const field = schema.persistedFields[name]
				const target =
					field === undefined ? undefined : getFieldSchemaTarget(field)?.()
				return [
					name,
					target === undefined
						? targetInput
						: decodeArguments(
								target,
								targetInput,
								limits,
								field?.kind === 'relation',
							),
				]
			}),
		),
	)
}

const decodeArguments = (
	schema: SchemaDefinition,
	value: unknown,
	limits: RestReadLimits,
	collection: boolean,
): unknown => {
	if (!isPlainRecord(value)) return value
	const decoded: Record<string, unknown> = { ...value }
	if (Object.hasOwn(value, 'where')) {
		decoded.where = decodeRestWhere(schema, value.where)
	}
	if (Object.hasOwn(value, 'include')) {
		decoded.include = decodeRestInclude(schema, value.include, limits)
	}
	if (!Object.hasOwn(value, 'take')) {
		// Collections never run unbounded when the caller omits `take`.
		if (collection) decoded.take = limits.defaultTake
	} else if (typeof value.take === 'number' && value.take > limits.maxTake) {
		throw invalidRestRead()
	}
	return immutableRecord(decoded)
}

/** @internal Decodes one REST read into the transport-free Core input object. */
export const decodeRestReadInput = async (
	schema: SchemaDefinition,
	input: RestReadRequest,
	limits: RestReadLimits = defaultRestReadLimits,
): Promise<unknown> => {
	const { request } = input
	try {
		request.signal.throwIfAborted()
		const normalizedLimits = normalizeRestLimits(limits, 'read')
		const isGet = request.method === 'GET'
		if (
			!(isGet || (request.method === 'POST' && input.operation !== 'get')) ||
			(!isGet && parseRestQueryEntries(request).length > 0)
		) {
			throw invalidRestRead()
		}
		let raw = isGet
			? parseGetInput(request, input.operation)
			: await readRestJsonBody(
					request,
					normalizedLimits.bodyBytes,
					invalidRestRead,
				)
		if (input.operation === 'get') {
			if (!isUuidV7(input.id) || !isPlainRecord(raw)) throw invalidRestRead()
			raw = immutableRecord({ ...raw, id: input.id })
		}
		const decoded = decodeArguments(
			schema,
			raw,
			normalizedLimits,
			input.operation === 'find',
		)
		request.signal.throwIfAborted()
		return input.operation === 'find' && isPlainRecord(decoded)
			? decodeRestAfterCursor(schema, decoded, invalidRestRead)
			: decoded
	} catch (error) {
		if (
			error instanceof RestReadNormalizationError ||
			request.signal.aborted ||
			isRestPositionError(error)
		) {
			throw error
		}
		throw invalidRestRead()
	}
}

/** Decodes one REST read into a transport-free immutable Core operation AST. */
export const normalizeRestReadRequest = async <
	const TSchema extends SchemaDefinition,
	const TInput extends RestReadRequest,
>(
	schema: TSchema,
	input: TInput,
	limits: RestReadLimits = defaultRestReadLimits,
): Promise<RestReadOperationAst<TSchema, TInput['operation']>> => {
	const decoded = await decodeRestReadInput(schema, input, limits)
	return normalizeRestReadInput(schema, input, decoded) as RestReadOperationAst<
		TSchema,
		TInput['operation']
	>
}

/** @internal Normalizes one decoded REST read input through Core. */
export const normalizeRestReadInput = (
	schema: SchemaDefinition,
	input: RestReadRequest,
	decoded: unknown,
): ReturnType<typeof normalizeReadOperation> => {
	try {
		return normalizeReadOperation(
			schema,
			readOperationKinds[input.operation],
			decoded,
		)
	} catch (error) {
		if (isRestPositionError(error)) throw error
		throw invalidRestRead()
	}
}

/**
 * Executes one REST read through Core while leaving response encoding to the caller.
 *
 * @example
 * `await executeRestReadRequest(executor, context, Post, { operation: 'find', request })`
 */
export const executeRestReadRequest = async <
	const TSchema extends SchemaDefinition,
	const TInput extends RestReadRequest,
>(
	executor: ApplicationRequestExecutor,
	context: RequestContext,
	schema: TSchema,
	input: TInput,
	limits?: RestReadLimits,
): Promise<
	OperationResult<RestReadOperationAst<TSchema, TInput['operation']>>
> =>
	executor.executeRead(
		context,
		await normalizeRestReadRequest(schema, input, limits),
	)
