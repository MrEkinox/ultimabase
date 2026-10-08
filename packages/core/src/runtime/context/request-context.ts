import {
	RequestCapability,
	RequestContextValue,
	type AnonymousRequestAccess,
	type MasterRequestAccess,
	type RequestAccess,
} from '../../access/index.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	assertExactEnumerablePlainObject,
	assertPlainObject,
} from '../../exact-object-validation.js'

const declaredRequestSources = {
	internal: 'internal',
} as const

/** Names Core's own source while plugins retain their transport-owned literals. */
export const requestSources: Readonly<typeof declaredRequestSources> =
	immutableRecord(declaredRequestSources)

/** Extracts the internal source provided by the framework. */
export type BuiltInRequestSource =
	(typeof requestSources)[keyof typeof requestSources]

/** Prevents known credential fields from entering diagnostic request metadata. */
export type RequestMetadata = Readonly<Record<string, unknown>> & {
	readonly accessToken?: never
	readonly apiKey?: never
	readonly authorization?: never
	readonly clientSecret?: never
	readonly cookie?: never
	readonly masterKey?: never
	readonly password?: never
	readonly refreshToken?: never
	readonly sessionToken?: never
}

/** Carries source-specific values that are safe to retain for one operation. */
export interface RequestContextOptions<TSource extends string = string> {
	readonly requestId: string
	readonly source: TSource
	/** Propagates transport or internal cancellation without exposing its controller. */
	readonly signal?: AbortSignal
	readonly capabilities?: readonly RequestCapability[]
	readonly metadata?: RequestMetadata
}

const requestContextOptionKeys = new Set([
	'capabilities',
	'metadata',
	'requestId',
	'signal',
	'source',
])

const emptyCapabilities: readonly RequestCapability[] = immutableArray([])
const emptyMetadata: RequestMetadata = immutableRecord({})
const persistentRequestSignal: AbortSignal = new AbortController().signal
const sensitiveMetadataKeys = new Set([
	'accesstoken',
	'apikey',
	'authorization',
	'clientsecret',
	'cookie',
	'password',
	'refreshtoken',
	'sessiontoken',
])

type StoredRequestContextValue = RequestContextValue<unknown>
type StoredRequestContextValues = ReadonlyMap<
	StoredRequestContextValue,
	unknown
>

const emptyRequestContextValues: StoredRequestContextValues = new Map()
const requestContextValues = new WeakMap<
	RequestContext,
	StoredRequestContextValues
>()
const requestContextOwners = new WeakMap<RequestContext, object>()
const masterRequestContextProvenance = new WeakMap<
	RequestContext,
	MasterRequestContextProvenance
>()

/** Identifies the exact Core-owned issuer without exposing it on request state. */
export interface MasterRequestContextProvenance {
	readonly application: object
	readonly authority: object
}

/** Keeps application ownership private while derived contexts retain isolation. */
const inheritRequestContextOwner = (
	source: RequestContext,
	target: RequestContext,
): void => {
	const owner = requestContextOwners.get(source)

	if (owner !== undefined) {
		requestContextOwners.set(target, owner)
	}

	const provenance = masterRequestContextProvenance.get(source)
	if (provenance !== undefined) {
		masterRequestContextProvenance.set(target, provenance)
	}
}

type TrustedMasterContextFactory = <
	TAccess extends RequestAccess,
	const TSource extends string,
>(
	reason: string,
	keyId: string,
	context: RequestContext<TAccess, TSource>,
	provenance: MasterRequestContextProvenance,
) => RequestContext<MasterRequestAccess, TSource>

let trustedMasterContextFactory: TrustedMasterContextFactory

function assertRequestContextOptions(
	options: unknown,
): asserts options is RequestContextOptions {
	assertExactEnumerablePlainObject(
		options,
		requestContextOptionKeys,
		'Request context options must be a plain object',
		'Unknown request context option: ',
	)

	assertNonEmptyString(options.requestId, 'Request context requestId')
	assertNonEmptyString(options.source, 'Request context source')

	if (
		options.signal !== undefined &&
		!(options.signal instanceof AbortSignal)
	) {
		throw new TypeError('Request context signal must be an AbortSignal')
	}
}

const normalizeSensitiveMetadataKey = (key: string): string =>
	key.toLowerCase().replaceAll('-', '').replaceAll('_', '')

const isRequestCapability = (value: unknown): value is RequestCapability =>
	value instanceof RequestCapability

const snapshotMetadata = (metadata: unknown): RequestMetadata => {
	if (metadata === undefined) {
		return emptyMetadata
	}

	assertPlainObject(metadata, 'Request context metadata must be a plain object')

	for (const key of Object.keys(metadata)) {
		const normalizedKey = normalizeSensitiveMetadataKey(key)

		if (normalizedKey === 'masterkey') {
			throw new TypeError(
				'Request context metadata cannot contain a master key',
			)
		}

		if (sensitiveMetadataKeys.has(normalizedKey)) {
			throw new TypeError(
				`Request context metadata cannot contain credential field: ${key}`,
			)
		}
	}

	// Metadata values remain opaque while the top-level record is detached and frozen.
	return immutableRecord(metadata)
}

const snapshotCapabilities = (
	capabilities: unknown,
): readonly RequestCapability[] => {
	if (capabilities === undefined) {
		return emptyCapabilities
	}

	if (!isUnknownArray(capabilities)) {
		throw new TypeError('Request context capabilities must be an array')
	}

	return immutableArray(
		capabilities.map((capability, index) => {
			if (!isRequestCapability(capability)) {
				throw new TypeError(
					`Request context capabilities[${String(index)}] must be a RequestCapability`,
				)
			}
			return capability
		}),
	)
}

/** Reuses one immutable identity when deriving another context. */
const optionsOf = <TSource extends string>(
	context: RequestContext<RequestAccess, TSource>,
): RequestContextOptions<TSource> => ({
	capabilities: context.capabilities,
	metadata: context.metadata,
	requestId: context.requestId,
	signal: context.signal,
	source: context.source,
})

const createAnonymousAccess = (): AnonymousRequestAccess =>
	immutableRecord({ mode: 'anonymous' })

const createMasterAccess = (
	reason: string,
	keyId: string,
): MasterRequestAccess => {
	assertNonEmptyString(reason, 'Master access reason')
	assertNonEmptyString(keyId, 'Master access keyId')

	return immutableRecord({ keyId, mode: 'master', reason })
}

/**
 * Carries immutable request identity and safe request-scoped values through the
 * single Runtime pipeline.
 */
export class RequestContext<
	TAccess extends RequestAccess = RequestAccess,
	TSource extends string = string,
> {
	readonly access: TAccess
	readonly capabilities: readonly RequestCapability[]
	readonly metadata: RequestMetadata
	readonly requestId: string
	readonly signal: AbortSignal
	readonly source: TSource

	private constructor(
		access: TAccess,
		options: RequestContextOptions<TSource>,
		values: StoredRequestContextValues = emptyRequestContextValues,
	) {
		const untrustedOptions: unknown = options

		assertRequestContextOptions(untrustedOptions)

		this.access = access
		this.capabilities = snapshotCapabilities(options.capabilities)
		this.metadata = snapshotMetadata(options.metadata)
		this.requestId = options.requestId
		this.signal = options.signal ?? persistentRequestSignal
		this.source = options.source
		requestContextValues.set(this, values)

		// Context identity and authority cannot change during asynchronous execution.
		Object.freeze(this)
	}

	/** Creates one explicitly unauthenticated request context. */
	static anonymous<const TSource extends string>(
		options: RequestContextOptions<TSource>,
	): RequestContext<AnonymousRequestAccess, TSource> {
		return new RequestContext(createAnonymousAccess(), options)
	}

	/** Checks token identity so matching transport strings never grant capability. */
	hasCapability(capability: RequestCapability): boolean {
		return this.capabilities.some((candidate) => candidate === capability)
	}

	/**
	 * Reads one optional plugin-owned value with the exact type carried by its token.
	 *
	 * @example `context.getValue(authenticatedPrincipal)?.id`
	 */
	getValue<TValue>(token: RequestContextValue<TValue>): TValue | undefined {
		const untrustedToken: unknown = token

		if (!(untrustedToken instanceof RequestContextValue)) {
			throw new TypeError(
				'Request context value token must be a RequestContextValue',
			)
		}

		// Only the same token can store and recover its validated value type.
		return requestContextValues.get(this)?.get(token) as TValue | undefined
	}

	/**
	 * Returns a new context containing one validated plugin-owned value.
	 *
	 * Existing contexts and values remain unchanged. Adding the same token twice
	 * fails instead of allowing plugin order to replace trusted request state.
	 *
	 * @example `const authenticated = context.withValue(principal, { id })`
	 */
	withValue<TValue>(
		token: RequestContextValue<TValue>,
		value: NoInfer<TValue>,
	): RequestContext<TAccess, TSource> {
		const untrustedToken: unknown = token

		if (!(untrustedToken instanceof RequestContextValue)) {
			throw new TypeError(
				'Request context value token must be a RequestContextValue',
			)
		}

		const currentValues =
			requestContextValues.get(this) ?? emptyRequestContextValues

		if (currentValues.has(token)) {
			throw new TypeError(`Request context value already exists: ${token.name}`)
		}

		const nextValues = new Map(currentValues)
		nextValues.set(token, token.snapshot(value))

		const derived = new RequestContext(this.access, optionsOf(this), nextValues)

		inheritRequestContextOwner(this, derived)

		return derived
	}

	static {
		// The closure can call the private constructor without exposing a public master API.
		trustedMasterContextFactory = <
			TAccess extends RequestAccess,
			const TSource extends string,
		>(
			reason: string,
			keyId: string,
			context: RequestContext<TAccess, TSource>,
			provenance: MasterRequestContextProvenance,
		): RequestContext<MasterRequestAccess, TSource> => {
			if (requestContextOwners.get(context) !== provenance.application) {
				throw new TypeError(
					'Master request context requires an application-owned source context',
				)
			}

			const master = new RequestContext(
				createMasterAccess(reason, keyId),
				optionsOf(context),
				requestContextValues.get(context) ?? emptyRequestContextValues,
			)

			inheritRequestContextOwner(context, master)
			masterRequestContextProvenance.set(master, provenance)

			return master
		}
	}
}

/** @internal Reads the application identity claimed at the first engine binding. */
export const getRequestContextOwner = (
	context: RequestContext,
): object | undefined => requestContextOwners.get(context)

/** @internal Reads the opaque issuer attached only by Core's Master shell. */
export const getMasterRequestContextProvenance = (
	context: RequestContext,
): MasterRequestContextProvenance | undefined =>
	masterRequestContextProvenance.get(context)

/** @internal Claims an unbound context after Runtime validates exact ownership. */
export const setRequestContextOwner = (
	context: RequestContext,
	owner: object,
): void => {
	requestContextOwners.set(context, owner)
}

/** @internal Narrows opaque terminal input to the framework's precise context type. */
export const isRequestContext = (value: unknown): value is RequestContext =>
	value instanceof RequestContext

/**
 * Gives future Runtime authority code a non-public construction path. This
 * function is intentionally omitted from the package entry point.
 */
export const createTrustedMasterRequestContext = <
	TAccess extends RequestAccess,
	const TSource extends string,
>(
	reason: string,
	keyId: string,
	context: RequestContext<TAccess, TSource>,
	provenance: MasterRequestContextProvenance,
): RequestContext<MasterRequestAccess, TSource> =>
	trustedMasterContextFactory(reason, keyId, context, provenance)
