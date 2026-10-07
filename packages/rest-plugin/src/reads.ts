import {
	getFieldSchemaTarget,
	normalizeReadOperation,
	type ReadOperationAstForKind,
	type ReadOperationKind,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { invalidRestRead, RestReadNormalizationError } from './errors.js'
import { readRestJsonBody } from './read-body.js'
import { decodeRestWhere, isUuidV7 } from './read-values.js'

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

const getQueryKeys: Readonly<Record<RestReadOperation, ReadonlySet<string>>> =
	immutableRecord({
		count: new Set(['where']),
		exists: new Set(['where']),
		find: new Set(['include', 'limit', 'offset', 'orderBy', 'select', 'where']),
		first: new Set(['include', 'orderBy', 'select', 'where']),
		get: new Set(['include', 'select']),
	})

const decodeQueryComponent = (value: string): string => {
	try {
		return decodeURIComponent(value.replaceAll('+', ' '))
	} catch {
		throw invalidRestRead()
	}
}

export const parseRestQueryEntries = (
	request: Request,
): readonly [string, string][] => {
	let url: URL
	try {
		url = new URL(request.url)
	} catch {
		throw invalidRestRead()
	}
	if (url.search.length <= 1) return []

	return url.search
		.slice(1)
		.split('&')
		.map((entry) => {
			if (entry.length === 0) throw invalidRestRead()
			const separator = entry.indexOf('=')
			const name = decodeQueryComponent(
				separator === -1 ? entry : entry.slice(0, separator),
			)
			const value = decodeQueryComponent(
				separator === -1 ? '' : entry.slice(separator + 1),
			)
			if (name.length === 0) throw invalidRestRead()
			return [name, value] as const
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
		entries.length === 0 ||
		entries.some((entry) => entry.length === 0 || entry.trim() !== entry) ||
		new Set(entries).size !== entries.length
	) {
		throw invalidRestRead()
	}
	return entries
}

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
	if (!/^(?:0|[1-9]\d*)$/u.test(value)) throw invalidRestRead()
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed)) throw invalidRestRead()
	return parsed
}

type MutableInclude = Record<string, { include?: MutableInclude }>

const parseIncludePaths = (
	value: string,
): Readonly<Record<string, unknown>> => {
	const root: MutableInclude = {}
	for (const path of parseCommaList(value)) {
		const segments = path.split('.')
		if (segments.some((segment) => segment.length === 0))
			throw invalidRestRead()
		let current = root
		for (const [index, segment] of segments.entries()) {
			const terminal = index === segments.length - 1
			const existing = current[segment]
			if (terminal) {
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

export const parseRestIncludeParameter = (value: string): unknown =>
	value.trimStart().startsWith('{')
		? parseJson(value)
		: parseIncludePaths(value)

const parseGetInput = (
	request: Request,
	operation: RestReadOperation,
): Readonly<Record<string, unknown>> => {
	const allowed = getQueryKeys[operation]
	const result: Record<string, unknown> = {}
	for (const [name, value] of parseRestQueryEntries(request)) {
		if (!allowed.has(name) || Object.hasOwn(result, name))
			throw invalidRestRead()
		switch (name) {
			case 'where':
				result.where = parseJson(value)
				break
			case 'select':
				result.select = parseRestSelectionParameter(value)
				break
			case 'include':
				result.include = parseRestIncludeParameter(value)
				break
			case 'orderBy':
				result.orderBy = parseOrdering(value)
				break
			case 'limit':
			case 'offset':
				result[name] = parseNonNegativeInteger(value)
		}
	}
	return immutableRecord(result)
}

const normalizeLimits = (limits: RestReadLimits): RestReadLimits => {
	if (
		!Number.isSafeInteger(limits.bodyBytes) ||
		limits.bodyBytes < 1 ||
		!Number.isSafeInteger(limits.maximumResults) ||
		limits.maximumResults < 1
	) {
		throw new TypeError('REST read limits must be positive safe integers')
	}
	return immutableRecord(limits)
}

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
						: decodeInput(
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

const decodeInput = (
	schema: SchemaDefinition,
	value: unknown,
	limits: RestReadLimits,
	collection: boolean,
): unknown => {
	if (!isPlainRecord(value)) return value
	const decoded: Record<string, unknown> = { ...value }
	if (Object.hasOwn(value, 'where'))
		decoded.where = decodeRestWhere(schema, value.where)
	if (Object.hasOwn(value, 'include')) {
		decoded.include = decodeRestInclude(schema, value.include, limits)
	}
	if (Object.hasOwn(value, 'limit')) {
		if (
			typeof value.limit === 'number' &&
			value.limit > limits.maximumResults
		) {
			throw invalidRestRead()
		}
	} else if (collection) {
		decoded.limit = 100
	}
	return immutableRecord(decoded)
}

const assertMethod = (request: Request, operation: RestReadOperation): void => {
	const accepted =
		request.method === 'GET' ||
		(request.method === 'POST' && operation !== 'get')
	if (!accepted) throw invalidRestRead()
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
	try {
		input.request.signal.throwIfAborted()
		const normalizedLimits = normalizeLimits(limits)
		assertMethod(input.request, input.operation)
		if (
			input.request.method === 'POST' &&
			parseRestQueryEntries(input.request).length > 0
		) {
			throw invalidRestRead()
		}
		const raw =
			input.request.method === 'GET'
				? parseGetInput(input.request, input.operation)
				: await readRestJsonBody(input.request, normalizedLimits.bodyBytes)
		const withId =
			input.operation === 'get'
				? (() => {
						if (!isUuidV7(input.id) || !isPlainRecord(raw)) {
							throw invalidRestRead()
						}
						return immutableRecord({ ...raw, id: input.id })
					})()
				: raw
		const decoded = decodeInput(
			schema,
			withId,
			normalizedLimits,
			input.operation === 'find',
		)
		input.request.signal.throwIfAborted()
		return normalizeReadOperation(
			schema,
			readOperationKinds[input.operation],
			decoded,
		) as RestReadOperationAst<TSchema, TInput['operation']>
	} catch (error) {
		if (error instanceof RestReadNormalizationError) throw error
		if (input.request.signal.aborted) throw error
		throw invalidRestRead()
	}
}
