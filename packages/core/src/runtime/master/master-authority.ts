import type { RequestAccess, MasterRequestAccess } from '../../access/index.js'
import { FrameworkError } from '../../foundation.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import { createHash, timingSafeEqual } from 'node:crypto'

import { assertExactEnumerableKeys } from '../../exact-object-validation.js'

import {
	createTrustedMasterRequestContext,
	type RequestContext,
} from '../context/request-context.js'

/** Configures one raw credential while retaining only its digest at runtime. */
export interface MasterKeyDefinition {
	readonly id: string
	readonly value: string
}

/** Describes one successful elevation without exposing credential material. */
export interface MasterAccessEvent {
	readonly keyId: string
	readonly kind: 'master-access'
	readonly occurredAt: string
	readonly previousAccess: RequestAccess
	readonly reason: string
	readonly requestId: string
	readonly source: string
}

/** Requires an audit sink whenever master authority is configured. */
export interface MasterAuthorityOptions {
	/**
	 * Configures verification keys; the first key ID also labels trusted backend
	 * terminal elevations that do not retain or verify a raw credential.
	 */
	readonly keys: readonly MasterKeyDefinition[]
	readonly onUse: (event: MasterAccessEvent) => MaybePromise<void>
	readonly clock?: () => Date
}

interface NormalizedMasterKey {
	readonly digest: Uint8Array
	readonly id: string
}

type MasterKeyGrantFactory = (keyId: string) => MasterKeyGrant
type MasterRequestElevator = <
	TAccess extends RequestAccess,
	const TSource extends string,
>(
	authority: MasterAuthority,
	grant: MasterKeyGrant,
	context: RequestContext<TAccess, TSource>,
	reason: string,
	application: object,
) => Promise<RequestContext<MasterRequestAccess, TSource>>

let createMasterKeyGrant: MasterKeyGrantFactory
let elevateMasterRequestWithAuthority: MasterRequestElevator
const trustedTerminalGrants = new WeakMap<MasterAuthority, MasterKeyGrant>()

const grantApplications = new WeakMap<MasterKeyGrant, object>()

/** Binds verified public grants to their issuing or first consuming application. */
export const bindMasterGrantApplication = (
	grant: MasterKeyGrant,
	application: object,
): MasterKeyGrant => {
	const owner = grantApplications.get(grant)
	if (owner !== undefined && owner !== application)
		throw createPermissionDeniedError()
	grantApplications.set(grant, application)
	return grant
}

/** Represents one verified key without exposing a forgeable constructor. */
export class MasterKeyGrant {
	// The private type identity prevents structural grants before runtime ownership checks.
	declare private readonly masterKeyGrantIdentity: never

	readonly keyId: string

	private constructor(keyId: string) {
		this.keyId = keyId
		Object.freeze(this)
	}

	static {
		// Only this module can construct grants; authority instances still track ownership.
		createMasterKeyGrant = (keyId): MasterKeyGrant => new MasterKeyGrant(keyId)
	}
}

const authorityOptionKeys = new Set(['clock', 'keys', 'onUse'])
const keyDefinitionKeys = new Set(['id', 'value'])

const digestMasterKey = (value: string): Uint8Array =>
	createHash('sha256').update(value, 'utf8').digest()

const createPermissionDeniedError = (): FrameworkError<'PERMISSION_DENIED'> =>
	new FrameworkError(
		'PERMISSION_DENIED',
		'Master authority verification failed.',
		{ publicMessage: 'Master authority is not available.' },
	)

const normalizeMasterKeys = (
	value: unknown,
): readonly NormalizedMasterKey[] => {
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError('Master authority keys must be a non-empty array')
	}

	const normalizedKeys: NormalizedMasterKey[] = []
	const ids = new Set<string>()
	const digests = new Set<string>()

	for (const [index, candidate] of value.entries()) {
		if (!isPlainRecord(candidate)) {
			throw new TypeError(
				`Master authority keys[${String(index)}] must be a plain object`,
			)
		}

		assertExactEnumerableKeys(
			candidate,
			keyDefinitionKeys,
			'Master key definition contains unknown key: ',
		)
		assertNonEmptyString(candidate.id, 'Master key id')
		assertNonEmptyString(candidate.value, 'Master key value')

		const digest = digestMasterKey(candidate.value)
		const digestIdentity = Buffer.from(digest).toString('hex')

		if (ids.has(candidate.id)) {
			throw new TypeError(`Duplicate master key id: ${candidate.id}`)
		}

		if (digests.has(digestIdentity)) {
			throw new TypeError('Duplicate master key value')
		}

		ids.add(candidate.id)
		digests.add(digestIdentity)
		normalizedKeys.push(immutableRecord({ digest, id: candidate.id }))
	}

	return immutableArray(normalizedKeys)
}

/**
 * Verifies raw keys, owns opaque grants, and audits every successful use.
 *
 * Master contexts are minted only by an application-owned `RequestEngine` or
 * trusted terminal option. An authority cannot construct a standalone context.
 */
export class MasterAuthority {
	readonly #clock: () => Date
	readonly #grants = new WeakSet<MasterKeyGrant>()
	readonly #keys: readonly NormalizedMasterKey[]
	readonly #onUse: (event: MasterAccessEvent) => MaybePromise<void>

	constructor(options: MasterAuthorityOptions) {
		const untrustedOptions: unknown = options

		if (!isPlainRecord(untrustedOptions)) {
			throw new TypeError('Master authority options must be a plain object')
		}

		assertExactEnumerableKeys(
			untrustedOptions,
			authorityOptionKeys,
			'Master authority contains unknown key: ',
		)

		if (typeof untrustedOptions.onUse !== 'function') {
			throw new TypeError('Master authority onUse must be a function')
		}

		if (
			untrustedOptions.clock !== undefined &&
			typeof untrustedOptions.clock !== 'function'
		) {
			throw new TypeError('Master authority clock must be a function')
		}

		this.#keys = normalizeMasterKeys(untrustedOptions.keys)
		this.#onUse = options.onUse
		this.#clock = options.clock ?? (() => new Date())

		const defaultKey = this.#keys[0]

		if (defaultKey === undefined) {
			// Normalization already rejects this state; the guard keeps the invariant explicit.
			throw new TypeError('Master authority requires a default key')
		}

		const trustedGrant = createMasterKeyGrant(defaultKey.id)
		this.#grants.add(trustedGrant)
		trustedTerminalGrants.set(this, trustedGrant)
		Object.freeze(this)
	}

	/** Converts a raw verification input into an authority-owned opaque grant. */
	authorize(rawKey: string): MasterKeyGrant {
		assertNonEmptyString(rawKey, 'Master key')

		const candidateDigest = digestMasterKey(rawKey)
		let matchingKey: NormalizedMasterKey | undefined

		// Every configured digest is compared so key position does not create an early exit.
		for (const key of this.#keys) {
			if (timingSafeEqual(candidateDigest, key.digest)) {
				matchingKey = key
			}
		}

		if (matchingKey === undefined) {
			throw createPermissionDeniedError()
		}

		const grant = createMasterKeyGrant(matchingKey.id)
		this.#grants.add(grant)

		return grant
	}

	/** Audits an owned grant before the application shell constructs Master state. */
	async #elevate<TAccess extends RequestAccess, const TSource extends string>(
		grant: MasterKeyGrant,
		context: RequestContext<TAccess, TSource>,
		reason: string,
		application: object,
	): Promise<RequestContext<MasterRequestAccess, TSource>> {
		if (!(grant instanceof MasterKeyGrant) || !this.#grants.has(grant)) {
			throw createPermissionDeniedError()
		}

		// The private terminal grant never escapes; explicit grants retain application provenance.
		if (grant !== trustedTerminalGrants.get(this))
			bindMasterGrantApplication(grant, application)
		assertNonEmptyString(reason, 'Master access reason')

		const occurredAt = this.#clock()

		if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
			throw new TypeError('Master authority clock must return a valid Date')
		}

		const event: MasterAccessEvent = immutableRecord({
			keyId: grant.keyId,
			kind: 'master-access',
			occurredAt: occurredAt.toISOString(),
			previousAccess: context.access,
			reason,
			requestId: context.requestId,
			source: context.source,
		})

		await this.#onUse(event)

		// The trusted factory changes only authority and retains plugin-owned values.
		return createTrustedMasterRequestContext(reason, grant.keyId, context, {
			application,
			authority: this,
		})
	}

	static {
		// Only this module exposes the closure used by the application-owned shell.
		elevateMasterRequestWithAuthority = (
			authority,
			grant,
			context,
			reason,
			application,
		) => authority.#elevate(grant, context, reason, application)
	}
}

/** @internal Audits an opaque grant through the exact configured authority. */
export const elevateMasterRequest = <
	TAccess extends RequestAccess,
	const TSource extends string,
>(
	authority: MasterAuthority,
	grant: MasterKeyGrant,
	context: RequestContext<TAccess, TSource>,
	reason: string,
	application: object,
): Promise<RequestContext<MasterRequestAccess, TSource>> =>
	elevateMasterRequestWithAuthority(
		authority,
		grant,
		context,
		reason,
		application,
	)

/**
 * Elevates trusted backend terminal code through the authority's default audit
 * identity without exposing a forgeable grant or retaining a raw credential.
 *
 * @internal
 */
export const elevateTrustedMasterRequest = <
	TAccess extends RequestAccess,
	const TSource extends string,
>(
	authority: MasterAuthority,
	context: RequestContext<TAccess, TSource>,
	reason: string,
	application: object,
): Promise<RequestContext<MasterRequestAccess, TSource>> => {
	const grant = trustedTerminalGrants.get(authority)

	if (grant === undefined) {
		throw createPermissionDeniedError()
	}

	return elevateMasterRequest(authority, grant, context, reason, application)
}
