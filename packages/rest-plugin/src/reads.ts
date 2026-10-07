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

export const defaultRestReadLimits: Readonly<{
	readonly bodyBytes: 1_048_576
	readonly maximumResults: 1000
}> = immutableRecord({
	bodyBytes: 1_048_576,
	maximumResults: 1000,
} as const)

export interface RestReadLimits {
	readonly bodyBytes: number
	readonly maximumResults: number
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
		find: ['include', 'limit', 'offset', 'orderBy', 'select', 'where'],
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
		!Number.isSafeInteger(limits.maximumResults) ||
		limits.maximumResults < 1
	) {
		throw new TypeError(
			`REST ${boundary} limits must be positive safe integers`,
		)
	}
	return immutableRecord(limits)
}

const decodeQueryComponent = (value: string): string => {
	try {
		return decodeURIComponent(value.replaceAll('+', ' '))
	} catch {
		throw invalidRestRead()
	}
}

/** @internal Splits the raw query without merging repeated or empty names. */
export const parseRestQueryEntries = (
	request: Request,
): readonly [string, string][] => {
	let search: string
	try {
		search = new URL(request.url).search
	} catch {
		throw invalidRestRead()
	}
	if (search.length <= 1) return []
	return search
		.slice(1)
		.split('&')
		.map((entry) => {
			if (entry.length === 0) throw invalidRestRead()
			const separator = entry.indexOf('=')
			const name = decodeQueryComponent(
				separator === -1 ? entry : entry.slice(0, separator),
			)
			if (name.length === 0) throw invalidRestRead()
			const value = separator === -1 ? '' : entry.slice(separator + 1)
			return [name, decodeQueryComponent(value)] as const
		})
}

const parseJson = (value: string): unknown => {
	try {
		return JSON.parse(value) as unknown
	} catch {
		throw invalidRestRead()
	}
}

const parseCommaList = (value: string): readonly string[] => {
	const entries = value.split(',')
	if (
		entries.some((entry) => entry.length === 0 || entry.trim() !== entry) ||
		new Set(entries).size !== entries.length
	) {
		throw invalidRestRead()
	}
	return entries
}

/** @internal Parses `select=a,b` into Core's flat selection object. */
export const parseRestSelectionParameter = (
	value: string,
): Readonly<Record<string, true>> =>
	immutableRecord(
		Object.fromEntries(parseCommaList(value).map((name) => [name, true])),
	)

const parseOrdering = (
	value: string,
): Readonly<Record<string, 'asc' | 'desc'>> => {
	const fields = new Set<string>()
	return immutableRecord(
		Object.fromEntries(
			parseCommaList(value).map((entry) => {
				const descending = entry.startsWith('-')
				const field = descending ? entry.slice(1) : entry
				if (field.length === 0 || fields.has(field)) throw invalidRestRead()
				fields.add(field)
				return [field, descending ? 'desc' : 'asc']
			}),
		),
	)
}

const parseNonNegativeInteger = (value: string): number => {
	const parsed = Number(value)
	if (!/^(?:0|[1-9]\d*)$/u.test(value) || !Number.isSafeInteger(parsed)) {
		throw invalidRestRead()
	}
	return parsed
}

type MutableInclude = Record<string, { include?: MutableInclude }>

// Dotted paths such as `author.profile` become nested `{ include }` objects.
const parseIncludePaths = (
	value: string,
): Readonly<Record<string, unknown>> => {
	const root: MutableInclude = {}
	for (const path of parseCommaList(value)) {
		const segments = path.split('.')
		if (segments.some((segment) => segment.length === 0)) {
			throw invalidRestRead()
		}
		let current = root
		for (const [index, segment] of segments.entries()) {
			const existing = current[segment]
			if (index === segments.length - 1) {
				if (existing !== undefined) throw invalidRestRead()
				current[segment] = {}
				continue
			}
			if (existing !== undefined && existing.include === undefined) {
				throw invalidRestRead()
			}
			const next = existing ?? { include: {} }
			current[segment] = next
			current = next.include ?? {}
		}
	}
	return immutableRecord(root)
}

/** @internal Accepts either JSON include arguments or dotted include paths. */
export const parseRestIncludeParameter = (value: string): unknown =>
	value.trimStart().startsWith('{')
		? parseJson(value)
		: parseIncludePaths(value)

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
	if (!Object.hasOwn(value, 'limit')) {
		// Collections never run unbounded when the caller omits a limit.
		if (collection) decoded.limit = 100
	} else if (
		typeof value.limit === 'number' &&
		value.limit > limits.maximumResults
	) {
		throw invalidRestRead()
	}
	return immutableRecord(decoded)
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
		return normalizeReadOperation(
			schema,
			readOperationKinds[input.operation],
			decoded,
		) as RestReadOperationAst<TSchema, TInput['operation']>
	} catch (error) {
		if (error instanceof RestReadNormalizationError || request.signal.aborted) {
			throw error
		}
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
