import type {
	ApplicationRequestExecutor,
	ApplicationSchemaMutationRequest,
	ApplicationSchemaMutationResult,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	decodeParameter,
	invalidRestMutation,
	readRestErrorDetails,
	restErrorDetails,
	RestMutationNormalizationError,
} from './errors.js'
import { decodeRestWhere, isUuidV7 } from './field-values.js'
import { decodeRestMutationData } from './nested-mutation-values.js'
import { assertEmptyRestBody, readRestJsonBody } from './read-body.js'
import {
	decodeRestInclude,
	defaultRestReadLimits,
	normalizeRestLimits,
	parseRestIncludeParameter,
	parseRestQueryEntries,
	parseRestSelectionParameter,
	type RestReadLimits,
} from './reads.js'
import type { RequestContext } from '@ultimabase/core/plugin'

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

// Each operation's Core command kind, accepted HTTP method, and query projection.
const mutationContracts: Readonly<
	Record<
		RestMutationOperation,
		readonly [
			kind: ApplicationSchemaMutationRequest['kind'],
			method: string,
			queryKeys: readonly string[],
		]
	>
> = immutableRecord({
	'bulk-create': ['create-many', 'POST', []],
	'bulk-delete': ['delete-many', 'POST', []],
	'bulk-update': ['update-many', 'POST', []],
	'bulk-upsert': ['upsert-many', 'POST', []],
	create: ['create-one', 'POST', ['include', 'select']],
	delete: ['delete-one', 'DELETE', ['select']],
	update: ['update-one', 'PATCH', ['include', 'select']],
	upsert: ['upsert-one', 'POST', []],
})

type Decoder = (input: unknown) => unknown

// Replaces only present keys and preserves every other key for Core validation.
const decodeKeys = (
	value: unknown,
	decoders: Readonly<Record<string, Decoder>>,
): unknown => {
	if (!isPlainRecord(value)) return value
	const decoded: Record<string, unknown> = { ...value }
	for (const [key, decode] of Object.entries(decoders)) {
		if (Object.hasOwn(value, key)) decoded[key] = decode(value[key])
	}
	return immutableRecord(decoded)
}

const decodeList = (value: unknown, decode: Decoder): unknown =>
	isUnknownArray(value)
		? immutableArray(value.map((item) => decode(item)))
		: value

const dataDecoder =
	(
		schema: SchemaDefinition,
		mode: 'create' | 'update',
		relationships: 'flat' | 'nested',
	): Decoder =>
	(input) =>
		decodeRestMutationData(
			schema,
			input,
			mode,
			relationships,
			invalidRestMutation,
		)

/** Decodes one body key, placing its failures in that parameter (ADR-0324). */
const inParameter =
	(parameter: string, decode: Decoder): Decoder =>
	(input) =>
		decodeParameter(parameter, invalidRestMutation, () => decode(input))

const decodeUpsert = (schema: SchemaDefinition, value: unknown): unknown =>
	decodeKeys(value, {
		where: inParameter('where', (where) => decodeRestWhere(schema, where)),
		create: inParameter('create', dataDecoder(schema, 'create', 'flat')),
		update: inParameter('update', dataDecoder(schema, 'update', 'flat')),
	})

const decodeBulk = (
	schema: SchemaDefinition,
	operation: RestMutationOperation,
	value: unknown,
	limits: RestReadLimits,
): unknown => {
	const decodeItem: Decoder =
		operation === 'bulk-create'
			? dataDecoder(schema, 'create', 'flat')
			: operation === 'bulk-upsert'
				? (item) => decodeUpsert(schema, item)
				: (item) =>
						decodeKeys(item, {
							where: (where) => decodeRestWhere(schema, where),
							data: dataDecoder(schema, 'update', 'flat'),
						})
	// Bulk delete accepts a list of predicates; every other bulk form lists data.
	const listsWhere =
		operation === 'bulk-delete' &&
		isPlainRecord(value) &&
		isUnknownArray(value.where)
	return decodeKeys(value, {
		include: inParameter('include', (include) =>
			decodeRestInclude(schema, include, limits),
		),
		...(listsWhere
			? {
					where: inParameter('where', (where) =>
						decodeList(where, (item) => decodeRestWhere(schema, item)),
					),
				}
			: { data: inParameter('data', (data) => decodeList(data, decodeItem)) }),
	})
}

const parseProjectionQuery = (
	schema: SchemaDefinition,
	request: Request,
	allowed: readonly string[],
	limits: RestReadLimits,
): Readonly<Record<string, unknown>> => {
	const projection: Record<string, unknown> = {}
	for (const [name, value] of decodeParameter(
		'query',
		invalidRestMutation,
		() => parseRestQueryEntries(request),
	)) {
		if (!allowed.includes(name)) {
			throw invalidRestMutation(
				undefined,
				restErrorDetails(
					name,
					allowed.length === 0
						? 'is not accepted: this route takes no query parameter'
						: `is not a parameter of this route; use ${allowed.join(', ')}`,
				),
			)
		}
		if (Object.hasOwn(projection, name)) {
			throw invalidRestMutation(
				undefined,
				restErrorDetails(name, 'is repeated'),
			)
		}
		projection[name] = decodeParameter(name, invalidRestMutation, () =>
			name === 'select'
				? parseRestSelectionParameter(value)
				: decodeRestInclude(schema, parseRestIncludeParameter(value), limits),
		)
	}
	return immutableRecord(projection)
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
	const { request } = input
	try {
		request.signal.throwIfAborted()
		const normalizedLimits = normalizeRestLimits(limits, 'mutation')
		const [kind, method, queryKeys] = mutationContracts[input.operation]
		if (request.method !== method) throw invalidRestMutation()
		const projection = parseProjectionQuery(
			schema,
			request,
			queryKeys,
			normalizedLimits,
		)
		if (
			(input.operation === 'delete' || input.operation === 'update') &&
			!isUuidV7(input.id)
		) {
			throw invalidRestMutation(
				undefined,
				restErrorDetails('id', 'must be a UUID v7 identifier'),
			)
		}

		let commandInput: unknown
		if (input.operation === 'delete') {
			await assertEmptyRestBody(request, invalidRestMutation)
			commandInput = immutableRecord({
				where: immutableRecord({ id: immutableRecord({ eq: input.id }) }),
				...projection,
			})
		} else {
			const body = await readRestJsonBody(
				request,
				normalizedLimits.bodyBytes,
				invalidRestMutation,
			)
			commandInput =
				input.operation === 'create'
					? immutableRecord({
							data: inParameter(
								'body',
								dataDecoder(schema, 'create', 'nested'),
							)(body),
							...projection,
						})
					: input.operation === 'update'
						? immutableRecord({
								data: inParameter(
									'body',
									dataDecoder(schema, 'update', 'nested'),
								)(body),
								where: immutableRecord({
									id: immutableRecord({ eq: input.id }),
								}),
								...projection,
							})
						: input.operation === 'upsert'
							? decodeUpsert(schema, body)
							: decodeBulk(schema, input.operation, body, normalizedLimits)
		}
		request.signal.throwIfAborted()
		return immutableRecord({
			kind,
			input: commandInput,
		}) as RestMutationCommand<TSchema, TInput['operation']>
	} catch (error) {
		if (
			error instanceof RestMutationNormalizationError ||
			request.signal.aborted
		) {
			throw error
		}
		throw invalidRestMutation(undefined, readRestErrorDetails(error))
	}
}

/** Executes one REST mutation through Core's schema-command request boundary. */
export const executeRestMutationRequest = async <
	const TSchema extends SchemaDefinition,
	const TInput extends RestMutationRequest,
>(
	executor: ApplicationRequestExecutor,
	context: RequestContext,
	schema: TSchema,
	input: TInput,
	limits?: RestReadLimits,
): Promise<
	ApplicationSchemaMutationResult<
		RestMutationCommand<TSchema, TInput['operation']>
	>
> =>
	executor.executeMutation(
		context,
		schema,
		await normalizeRestMutationRequest(schema, input, limits),
	)
