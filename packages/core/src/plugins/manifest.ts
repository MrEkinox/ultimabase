import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { valid, validRange } from 'semver'

import {
	assertOptionalCapabilityRequirement,
	normalizeCapabilityDeclarations,
	type CapabilityRequirement,
	type CapabilityToken,
	type PluginCapabilityDeclarationOptions,
	type PluginCapabilityDeclarations,
} from './capabilities.js'

/** Identifies one installed plugin definition without constructing a string key. */
export interface PluginIdentity<
	TPluginId extends string = string,
	TInstanceId extends string | undefined = string | undefined,
> {
	/** Stable namespaced identity shared by every configured instance of the plugin. */
	readonly pluginId: TPluginId
	/** Explicit application-local identity required when the same plugin is configured more than once. */
	readonly instanceId?: TInstanceId
}

/** Targets one named plugin contract when a capability cannot express the dependency. */
export interface PluginDependency<
	TPluginId extends string = string,
	TVersion extends string = string,
	TInstanceId extends string | undefined = string | undefined,
> {
	/** Stable plugin package identity. */
	readonly pluginId: TPluginId
	/** Compatible semantic package-version range. */
	readonly version: TVersion
	/** Optional exact configured instance target. */
	readonly instanceId?: TInstanceId
}

/** Classifies how prominently one requested privilege is reported. */
export type PluginPrivilegeSeverity = 'critical' | 'sensitive' | 'standard'

/** Names the Core-owned facade that enforces one plugin privilege. */
export type PluginPrivilegeFacade =
	| 'adapter'
	| 'authority'
	| 'capability'
	| 'event'
	| 'filesystem'
	| 'migration'
	| 'model'
	| 'network'
	| 'operation'
	| 'persistence'
	| 'query'
	| 'runtime'
	| 'schema'
	| 'transport'
	| 'typegen'

/** Describes the stable reporting and enforcement owner for one privilege. */
export interface PluginPrivilegeMetadata {
	readonly facade: PluginPrivilegeFacade
	readonly severity: PluginPrivilegeSeverity
}

const privilegeMetadata = (
	facade: PluginPrivilegeFacade,
	severity: PluginPrivilegeSeverity,
): PluginPrivilegeMetadata => immutableRecord({ facade, severity })

/**
 * Lists every Core-enforceable power that a plugin may request.
 *
 * @example
 * ```ts
 * const privilege: PluginPrivilege = 'schema:transform'
 * ```
 */
export type PluginPrivilege =
	| 'adapter:consume'
	| 'adapter:raw'
	| 'authority:elevate'
	| 'capability:decorate'
	| 'capability:replace'
	| 'event:publish'
	| 'filesystem:read'
	| 'filesystem:write'
	| 'migration:contribute'
	| 'model:extend'
	| 'network:access'
	| 'operation:declare'
	| 'persistence:rewrite'
	| 'query:extend'
	| 'runtime:constrain'
	| 'runtime:intercept'
	| 'runtime:observe'
	| 'runtime:replace'
	| 'schema:declare'
	| 'schema:replace'
	| 'schema:transform'
	| 'transport:expose'
	| 'typegen:contribute'
	| 'typegen:emit'
	| 'typegen:reference'
	| 'typegen:replace'

/**
 * Documents the severity and Core-owned facade for every concrete privilege.
 * A privilege never implies another privilege.
 */
export const pluginPrivilegeMetadata: Readonly<
	Record<PluginPrivilege, PluginPrivilegeMetadata>
> = immutableRecord({
	'schema:declare': privilegeMetadata('schema', 'standard'),
	'schema:transform': privilegeMetadata('schema', 'sensitive'),
	'schema:replace': privilegeMetadata('schema', 'critical'),
	'model:extend': privilegeMetadata('model', 'standard'),
	'query:extend': privilegeMetadata('query', 'standard'),
	'operation:declare': privilegeMetadata('operation', 'standard'),
	'capability:decorate': privilegeMetadata('capability', 'sensitive'),
	'capability:replace': privilegeMetadata('capability', 'sensitive'),
	'runtime:observe': privilegeMetadata('runtime', 'standard'),
	'runtime:intercept': privilegeMetadata('runtime', 'sensitive'),
	'runtime:constrain': privilegeMetadata('runtime', 'sensitive'),
	'runtime:replace': privilegeMetadata('runtime', 'critical'),
	'persistence:rewrite': privilegeMetadata('persistence', 'sensitive'),
	'adapter:consume': privilegeMetadata('adapter', 'standard'),
	'adapter:raw': privilegeMetadata('adapter', 'critical'),
	'migration:contribute': privilegeMetadata('migration', 'sensitive'),
	'transport:expose': privilegeMetadata('transport', 'sensitive'),
	'event:publish': privilegeMetadata('event', 'standard'),
	'typegen:reference': privilegeMetadata('typegen', 'standard'),
	'typegen:contribute': privilegeMetadata('typegen', 'standard'),
	'typegen:emit': privilegeMetadata('typegen', 'sensitive'),
	'typegen:replace': privilegeMetadata('typegen', 'critical'),
	'filesystem:read': privilegeMetadata('filesystem', 'sensitive'),
	'filesystem:write': privilegeMetadata('filesystem', 'sensitive'),
	'network:access': privilegeMetadata('network', 'sensitive'),
	'authority:elevate': privilegeMetadata('authority', 'critical'),
})

/** Separately reports direct Node.js behavior that Core cannot enforce. */
export type PluginEnvironmentClaim =
	| 'environment:filesystem'
	| 'environment:native-code'
	| 'environment:network'
	| 'environment:process'

/** Requests one exact Core-owned power for a documented purpose. */
export interface PluginPrivilegeRequest<
	TPrivilege extends PluginPrivilege = PluginPrivilege,
	TWhen extends CapabilityRequirement<CapabilityToken, true> | undefined =
		CapabilityRequirement<CapabilityToken, true> | undefined,
> {
	/** Names one exact privilege from Core's closed vocabulary. */
	readonly name: TPrivilege
	/** Explains why the plugin needs this power in startup inspection. */
	readonly reason: string
	/** Activates the request only when this declared optional capability is present. */
	readonly when?: TWhen
}

/** Contains the inert immutable metadata inspected before plugin callbacks run. */
export interface PluginManifest<
	TPluginId extends string = string,
	TInstanceId extends string | undefined = string | undefined,
	TVersion extends string = string,
	TCoreRange extends string = string,
	TPrivileges extends readonly PluginPrivilegeRequest[] =
		readonly PluginPrivilegeRequest[],
	TEnvironment extends readonly PluginEnvironmentClaim[] =
		readonly PluginEnvironmentClaim[],
	TCapabilities extends PluginCapabilityDeclarations =
		PluginCapabilityDeclarations,
> {
	/** Carries the stable package and optional exact instance identity. */
	readonly identity: PluginIdentity<TPluginId, TInstanceId>
	/** Records the plugin package's canonical semantic version. */
	readonly version: TVersion
	/** Records the supported `@ultimabase/core` semantic-version range. */
	readonly core: TCoreRange
	/** Lists the exact enforceable powers requested by the plugin. */
	readonly privileges: TPrivileges
	/** Lists direct Node.js behaviors that Core reports but cannot enforce. */
	readonly environment: TEnvironment
	/** Lists inert typed providers and explicit required or optional protocol uses. */
	readonly capabilities: TCapabilities
}

export interface PluginManifestOptions {
	readonly pluginId: string
	readonly instanceId?: string
	readonly version: string
	readonly core: string
	readonly privileges?: readonly PluginPrivilegeRequest[]
	readonly environment?: readonly PluginEnvironmentClaim[]
	readonly capabilities?: PluginCapabilityDeclarationOptions
}

const pluginIdPattern =
	/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)$/
const declaredPluginEnvironmentClaims = [
	'environment:filesystem',
	'environment:native-code',
	'environment:network',
	'environment:process',
] as const satisfies readonly PluginEnvironmentClaim[]

/** Lists every informational direct-environment claim accepted in manifests. */
export const pluginEnvironmentClaims: readonly PluginEnvironmentClaim[] =
	immutableArray(declaredPluginEnvironmentClaims)

const environmentClaims = new Set<PluginEnvironmentClaim>(
	pluginEnvironmentClaims,
)

/** Compares structured plugin identities without relying on serialized keys. */
export const isSamePluginIdentity = (
	left: PluginIdentity,
	right: PluginIdentity,
): boolean =>
	left.pluginId === right.pluginId && left.instanceId === right.instanceId

/** Formats one identity for diagnostics only; the result must never be used as a key. */
export const formatPluginIdentity = (identity: PluginIdentity): string =>
	identity.instanceId === undefined
		? identity.pluginId
		: `${identity.pluginId} (instance ${identity.instanceId})`

/** Validates stable plugin identities consistently across manifests and dependencies. */
export const assertPluginId: (
	value: unknown,
	path: string,
) => asserts value is string = (value, path) => {
	assertNonEmptyString(value, path)
	if (!pluginIdPattern.test(value)) {
		throw new TypeError(`${path} must be a namespaced plugin identifier`)
	}
}

const normalizePrivilegeRequests = (
	requests: readonly PluginPrivilegeRequest[] | undefined,
	optionalCapabilities: readonly CapabilityRequirement<CapabilityToken, true>[],
): readonly PluginPrivilegeRequest[] => {
	if (requests === undefined) return immutableArray([])

	const untrustedRequests: unknown = requests
	if (!isUnknownArray(untrustedRequests)) {
		throw new TypeError('privileges must be an array')
	}

	const names = new Set<PluginPrivilege>()
	return immutableArray(
		untrustedRequests.map((request, index) => {
			if (!isPlainRecord(request)) {
				throw new TypeError(
					`privileges[${String(index)}] must be a plain object`,
				)
			}

			const name = request.name
			if (
				typeof name !== 'string' ||
				!Object.hasOwn(pluginPrivilegeMetadata, name)
			) {
				throw new TypeError(
					`privileges[${String(index)}].name must be a concrete PluginPrivilege`,
				)
			}

			const privilege = name as PluginPrivilege
			if (names.has(privilege)) {
				throw new TypeError(`Duplicate plugin privilege request: ${privilege}`)
			}

			assertNonEmptyString(
				request.reason,
				`privileges[${String(index)}].reason`,
			)

			if (request.when !== undefined) {
				assertOptionalCapabilityRequirement(
					request.when,
					`privileges[${String(index)}].when`,
				)
				if (!optionalCapabilities.includes(request.when)) {
					throw new TypeError(
						`privileges[${String(index)}].when must reference a requirement from capabilities.optional`,
					)
				}
			}
			names.add(privilege)

			return immutableRecord({
				name: privilege,
				reason: request.reason,
				...(request.when === undefined ? {} : { when: request.when }),
			})
		}),
	)
}

const normalizeEnvironmentClaims = (
	claims: readonly PluginEnvironmentClaim[] | undefined,
): readonly PluginEnvironmentClaim[] => {
	if (claims === undefined) return immutableArray([])

	const untrustedClaims: unknown = claims
	if (!isUnknownArray(untrustedClaims)) {
		throw new TypeError('environment must be an array')
	}

	const normalized = new Set<PluginEnvironmentClaim>()
	for (const [index, claim] of untrustedClaims.entries()) {
		if (
			typeof claim !== 'string' ||
			!environmentClaims.has(claim as PluginEnvironmentClaim)
		) {
			throw new TypeError(
				`environment[${String(index)}] must be a concrete PluginEnvironmentClaim`,
			)
		}

		if (normalized.has(claim as PluginEnvironmentClaim)) {
			throw new TypeError(`Duplicate plugin environment claim: ${claim}`)
		}

		normalized.add(claim as PluginEnvironmentClaim)
	}

	return immutableArray([...normalized])
}

/** Validates and snapshots one inert plugin manifest without invoking plugin code. */
export const normalizePluginManifest = (
	options: PluginManifestOptions,
): PluginManifest => {
	assertPluginId(options.pluginId, 'pluginId')

	if (options.instanceId !== undefined) {
		assertNonEmptyString(options.instanceId, 'instanceId')
	}

	assertNonEmptyString(options.version, 'version')
	if (valid(options.version) !== options.version) {
		throw new TypeError('version must be a canonical semantic version')
	}

	assertNonEmptyString(options.core, 'core')
	if (validRange(options.core) === null) {
		throw new TypeError('core must be a valid semantic version range')
	}

	const capabilities = normalizeCapabilityDeclarations(options.capabilities)

	return immutableRecord({
		identity: immutableRecord({
			pluginId: options.pluginId,
			...(options.instanceId === undefined
				? {}
				: { instanceId: options.instanceId }),
		}),
		version: options.version,
		core: options.core,
		privileges: normalizePrivilegeRequests(
			options.privileges,
			capabilities.optional,
		),
		environment: normalizeEnvironmentClaims(options.environment),
		capabilities,
	})
}
