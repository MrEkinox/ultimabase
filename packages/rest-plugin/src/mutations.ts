import type {
	ApplicationSchemaMutationRequest,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	RestMutationNormalizationError,
	invalidRestMutation,
	restMutationErrorCodes,
} from './mutation-errors.js'
import { decodeRestMutationData } from './nested-mutation-values.js'
import { readRestJsonBody, type RestJsonBodyErrors } from './read-body.js'
import { decodeRestWhere, isUuidV7 } from './read-values.js'
import {
	decodeRestInclude,
	defaultRestReadLimits,
	parseRestIncludeParameter,
	parseRestQueryEntries,
	parseRestSelectionParameter,
	type RestReadLimits,
} from './reads.js'

export type RestMutationOperation =
	| 'bulk-create'
	| 'bulk-delete'
	| 'bulk-update'
	| 'bulk-upsert'
	| 'create'
	| 'delete'
	| 'update'
	| 'upsert'

export type RestMutationRequest =
	| Readonly<{
			operation: Exclude<RestMutationOperation, 'delete' | 'update'>
			request: Request
	  }>
	| Readonly<{
			id: string
			operation: 'delete' | 'update'
			request: Request
	  }>

export const defaultRestMutationLimits: RestReadLimits = defaultRestReadLimits

type CoreMutationKindFor<TOperation extends RestMutationOperation> =
	TOperation extends `bulk-${infer TKind}`
		? `${TKind & ('create' | 'delete' | 'update' | 'upsert')}-many`
		: `${TOperation}-one`

/** Resolves the exact Core schema mutation request produced by REST v1. */
export type RestMutationCommand<
	TSchema extends SchemaDefinition,
	TOperation extends RestMutationOperation,
> = Extract<
	ApplicationSchemaMutationRequest<TSchema>,
	{ readonly kind: CoreMutationKindFor<TOperation> }
>

const mutationKinds: Readonly<
	Record<RestMutationOperation, ApplicationSchemaMutationRequest['kind']>
> = immutableRecord({
	'bulk-create': 'create-many',
	'bulk-delete': 'delete-many',
	'bulk-update': 'update-many',
	'bulk-upsert': 'upsert-many',
	create: 'create-one',
	delete: 'delete-one',
	update: 'update-one',
	upsert: 'upsert-one',
})

const mutationMethods: Readonly<Record<RestMutationOperation, string>> =
	immutableRecord({
		'bulk-create': 'POST',
		'bulk-delete': 'POST',
		'bulk-update': 'POST',
		'bulk-upsert': 'POST',
		create: 'POST',
		delete: 'DELETE',
		update: 'PATCH',
		upsert: 'POST',
	})

const mutationBodyErrors: RestJsonBodyErrors = immutableRecord({
	bodyTooLarge: () =>
		new RestMutationNormalizationError(restMutationErrorCodes.bodyTooLarge),
	invalidInput: invalidRestMutation,
	unsupportedMediaType: () =>
		new RestMutationNormalizationError(
			restMutationErrorCodes.unsupportedMediaType,
		),
})

const normalizeLimits = (limits: RestReadLimits): RestReadLimits => {
	if (
		!Number.isSafeInteger(limits.bodyBytes) ||
		limits.bodyBytes < 1 ||
		!Number.isSafeInteger(limits.maximumResults) ||
		limits.maximumResults < 1
	) {
		throw new TypeError('REST mutation limits must be positive safe integers')
	}
	return immutableRecord(limits)
}

const decodeProjection = (
	schema: SchemaDefinition,
	value: Readonly<Record<string, unknown>>,
	limits: RestReadLimits,
): Readonly<Record<string, unknown>> =>
	immutableRecord({
		...value,
		...(Object.hasOwn(value, 'include')
			? { include: decodeRestInclude(schema, value.include, limits) }
			: {}),
	})

const parseProjectionQuery = (
	schema: SchemaDefinition,
	request: Request,
	operation: RestMutationOperation,
	limits: RestReadLimits,
): Readonly<Record<string, unknown>> => {
	const allowed =
		operation === 'create' || operation === 'update'
			? new Set(['include', 'select'])
			: operation === 'delete'
				? new Set(['select'])
				: new Set<string>()
	const projection: Record<string, unknown> = {}

	for (const [name, value] of parseRestQueryEntries(request)) {
		if (!allowed.has(name) || Object.hasOwn(projection, name)) {
			throw invalidRestMutation()
		}
		projection[name] =
			name === 'select'
				? parseRestSelectionParameter(value)
				: parseRestIncludeParameter(value)
	}

	return decodeProjection(schema, projection, limits)
}

const decodeUpsert = (schema: SchemaDefinition, value: unknown): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord({
		...value,
		...(Object.hasOwn(value, 'where')
			? { where: decodeRestWhere(schema, value.where) }
			: {}),
		...(Object.hasOwn(value, 'create')
			? {
					create: decodeRestMutationData(
						schema,
						value.create,
						'create',
						'flat',
						invalidRestMutation,
					),
				}
			: {}),
		...(Object.hasOwn(value, 'update')
			? {
					update: decodeRestMutationData(
						schema,
						value.update,
						'update',
						'flat',
						invalidRestMutation,
					),
				}
			: {}),
	})
}

const decodeBulk = (
	schema: SchemaDefinition,
	operation: RestMutationOperation,
	value: unknown,
	limits: RestReadLimits,
): unknown => {
	if (!isPlainRecord(value)) return value
	const decoded = decodeProjection(schema, value, limits)

	if (operation === 'bulk-delete' && isUnknownArray(value.where)) {
		return immutableRecord({
			...decoded,
			where: immutableArray(
				value.where.map((where) => decodeRestWhere(schema, where)),
			),
		})
	}
	if (!isUnknownArray(value.data)) return decoded

	return immutableRecord({
		...decoded,
		data: immutableArray(
			value.data.map((item) => {
				if (operation === 'bulk-create') {
					return decodeRestMutationData(
						schema,
						item,
						'create',
						'flat',
						invalidRestMutation,
					)
				}
				if (operation === 'bulk-upsert') return decodeUpsert(schema, item)
				if (!isPlainRecord(item)) return item
				return immutableRecord({
					...item,
					...(Object.hasOwn(item, 'where')
						? { where: decodeRestWhere(schema, item.where) }
						: {}),
					...(Object.hasOwn(item, 'data')
						? {
								data: decodeRestMutationData(
									schema,
									item.data,
									'update',
									'flat',
									invalidRestMutation,
								),
							}
						: {}),
				})
			}),
		),
	})
}

const assertBodylessDelete = async (request: Request): Promise<void> => {
	if (
		request.headers.has('content-type') ||
		request.headers.has('transfer-encoding') ||
		(request.headers.get('content-length') !== null &&
			request.headers.get('content-length') !== '0')
	) {
		throw invalidRestMutation()
	}

	const reader = request.body?.getReader()
	if (reader === undefined) return
	for (
		let result = await reader.read();
		!result.done;
		result = await reader.read()
	) {
		request.signal.throwIfAborted()
		if (result.value.byteLength > 0) {
			await reader.cancel()
			throw invalidRestMutation()
		}
	}
}

/** Decodes one REST mutation into a Core schema-command request. */
export const normalizeRestMutationRequest = async <
	const TSchema extends SchemaDefinition,
	const TInput extends RestMutationRequest,
>(
	schema: TSchema,
	input: TInput,
	limits: RestReadLimits = defaultRestReadLimits,
): Promise<RestMutationCommand<TSchema, TInput['operation']>> => {
	try {
		input.request.signal.throwIfAborted()
		const normalizedLimits = normalizeLimits(limits)
		if (input.request.method !== mutationMethods[input.operation]) {
			throw invalidRestMutation()
		}
		const projection = parseProjectionQuery(
			schema,
			input.request,
			input.operation,
			normalizedLimits,
		)
		if (
			(input.operation === 'delete' || input.operation === 'update') &&
			!isUuidV7(input.id)
		) {
			throw invalidRestMutation()
		}

		let commandInput: unknown
		if (input.operation === 'delete') {
			await assertBodylessDelete(input.request)
			commandInput = immutableRecord({ id: input.id, ...projection })
		} else {
			const body = await readRestJsonBody(
				input.request,
				normalizedLimits.bodyBytes,
				mutationBodyErrors,
			)
			if (input.operation === 'create') {
				commandInput = immutableRecord({
					data: decodeRestMutationData(
						schema,
						body,
						'create',
						'nested',
						invalidRestMutation,
					),
					...projection,
				})
			} else if (input.operation === 'update') {
				commandInput = immutableRecord({
					data: decodeRestMutationData(
						schema,
						body,
						'update',
						'nested',
						invalidRestMutation,
					),
					id: input.id,
					...projection,
				})
			} else if (input.operation === 'upsert') {
				commandInput = decodeUpsert(schema, body)
			} else {
				commandInput = decodeBulk(
					schema,
					input.operation,
					body,
					normalizedLimits,
				)
			}
		}
		input.request.signal.throwIfAborted()

		return immutableRecord({
			kind: mutationKinds[input.operation],
			input: commandInput,
		}) as RestMutationCommand<TSchema, TInput['operation']>
	} catch (error) {
		if (error instanceof RestMutationNormalizationError) throw error
		if (input.request.signal.aborted) throw error
		throw invalidRestMutation()
	}
}
