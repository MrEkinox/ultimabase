import {
	RequestCapability,
	type AnonymousRequestAccess,
	type MasterRequestAccess,
	type RequestAccess,
	type UserRequestAccess,
} from '../../access/index.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

const declaredRequestSources = {
	graphql: 'graphql',
	internal: 'internal',
	job: 'job',
	rest: 'rest',
} as const

/** Lists built-in sources while allowing plugins to retain custom literals. */
export const requestSources: Readonly<typeof declaredRequestSources> =
	immutableRecord(declaredRequestSources)

/** Extracts the transport and internal sources provided by the framework. */
export type BuiltInRequestSource =
	(typeof requestSources)[keyof typeof requestSources]

/** Prevents known credential fields from entering diagnostic request metadata. */
export type RequestMetadata = Readonly<Record<string, unknown>> & {
	readonly masterKey?: never
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

type TrustedMasterContextFactory = <const TSource extends string>(
	reason: string,
	keyId: string,
	options: RequestContextOptions<TSource>,
) => RequestContext<MasterRequestAccess, TSource>

let trustedMasterContextFactory: TrustedMasterContextFactory

function assertRequestContextOptions(
	options: unknown,
): asserts options is RequestContextOptions {
	if (!isPlainRecord(options)) {
		throw new TypeError('Request context options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!requestContextOptionKeys.has(key)) {
			throw new TypeError(`Unknown request context option: ${key}`)
		}
	}

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

	if (!isPlainRecord(metadata)) {
		throw new TypeError('Request context metadata must be a plain object')
	}

	for (const key of Object.keys(metadata)) {
		if (normalizeSensitiveMetadataKey(key) === 'masterkey') {
			throw new TypeError(
				'Request context metadata cannot contain a master key',
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

	const validatedCapabilities: RequestCapability[] = []

	for (const [index, capability] of capabilities.entries()) {
		if (!isRequestCapability(capability)) {
			throw new TypeError(
				`Request context capabilities[${String(index)}] must be a RequestCapability`,
			)
		}

		validatedCapabilities.push(capability)
	}

	return immutableArray(validatedCapabilities)
}

const createAnonymousAccess = (): AnonymousRequestAccess =>
	immutableRecord({ mode: 'anonymous' })

const createUserAccess = <const TUserId extends string>(
	userId: TUserId,
): UserRequestAccess<TUserId> => {
	assertNonEmptyString(userId, 'Request context userId')

	return immutableRecord({ mode: 'user', userId })
}

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
	) {
		const untrustedOptions: unknown = options

		assertRequestContextOptions(untrustedOptions)

		this.access = access
		this.capabilities = snapshotCapabilities(options.capabilities)
		this.metadata = snapshotMetadata(options.metadata)
		this.requestId = options.requestId
		this.signal = options.signal ?? persistentRequestSignal
		this.source = options.source

		// Context identity and authority cannot change during asynchronous execution.
		Object.freeze(this)
	}

	/** Creates one explicitly unauthenticated request context. */
	static anonymous<const TSource extends string>(
		options: RequestContextOptions<TSource>,
	): RequestContext<AnonymousRequestAccess, TSource> {
		return new RequestContext(createAnonymousAccess(), options)
	}

	/** Creates one authenticated user context from a stable user identifier. */
	static user<const TUserId extends string, const TSource extends string>(
		userId: TUserId,
		options: RequestContextOptions<TSource>,
	): RequestContext<UserRequestAccess<TUserId>, TSource> {
		return new RequestContext(createUserAccess(userId), options)
	}

	/** Checks token identity so matching transport strings never grant capability. */
	hasCapability(capability: RequestCapability): boolean {
		return this.capabilities.some((candidate) => candidate === capability)
	}

	static {
		// The closure can call the private constructor without exposing a public master API.
		trustedMasterContextFactory = <const TSource extends string>(
			reason: string,
			keyId: string,
			options: RequestContextOptions<TSource>,
		): RequestContext<MasterRequestAccess, TSource> =>
			new RequestContext(createMasterAccess(reason, keyId), options)
	}
}

/**
 * Gives future Runtime authority code a non-public construction path. This
 * function is intentionally omitted from the package entry point.
 */
export const createTrustedMasterRequestContext = <const TSource extends string>(
	reason: string,
	keyId: string,
	options: RequestContextOptions<TSource>,
): RequestContext<MasterRequestAccess, TSource> =>
	trustedMasterContextFactory(reason, keyId, options)
