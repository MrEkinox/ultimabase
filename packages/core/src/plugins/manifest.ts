import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { valid, validRange } from 'semver'

import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type {
	CapabilityRequirement,
	CapabilityToken,
	PluginCapabilityDeclarations,
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
	| 'authority'
	| 'capability'
	| 'event'
	| 'model'
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
 * const privilege: PluginPrivilege = 'schema:declare'
 * ```
 */
export type PluginPrivilege =
	| 'authority:elevate'
	| 'event:publish'
	| 'model:extend'
	| 'operation:declare'
	| 'persistence:rewrite'
	| 'runtime:constrain'
	| 'runtime:intercept'
	| 'runtime:observe'
	| 'schema:declare'
	| 'storage:private'
	| 'transport:expose'
	| 'typegen:reference'

/**
 * Documents the severity and Core-owned facade for every concrete privilege.
 * A privilege never implies another privilege.
 */
export const pluginPrivilegeMetadata: Readonly<
	Record<PluginPrivilege, PluginPrivilegeMetadata>
> = immutableRecord({
	'schema:declare': privilegeMetadata('schema', 'standard'),
	'storage:private': privilegeMetadata('persistence', 'critical'),
	'model:extend': privilegeMetadata('model', 'standard'),
	'operation:declare': privilegeMetadata('operation', 'standard'),
	'runtime:observe': privilegeMetadata('runtime', 'standard'),
	'runtime:intercept': privilegeMetadata('runtime', 'sensitive'),
	'runtime:constrain': privilegeMetadata('runtime', 'sensitive'),
	'persistence:rewrite': privilegeMetadata('persistence', 'sensitive'),
	'transport:expose': privilegeMetadata('transport', 'sensitive'),
	'event:publish': privilegeMetadata('event', 'standard'),
	'typegen:reference': privilegeMetadata('typegen', 'standard'),
	'authority:elevate': privilegeMetadata('authority', 'critical'),
})

/** Separately reports direct Node.js behavior that Core cannot enforce. */
export type PluginEnvironmentClaim =
	| 'environment:filesystem'
	| 'environment:native-code'
	| 'environment:network'
	| 'environment:process'

/** Describes why one direct-environment claim is reported and its review severity. */
export interface PluginEnvironmentClaimMetadata {
	readonly reason: string
	readonly severity: PluginPrivilegeSeverity
}

const environmentClaimMetadata = (
	reason: string,
	severity: PluginPrivilegeSeverity,
): PluginEnvironmentClaimMetadata => immutableRecord({ reason, severity })

/** Documents every informational claim without presenting it as enforceable. */
export const pluginEnvironmentClaimMetadata: Readonly<
	Record<PluginEnvironmentClaim, PluginEnvironmentClaimMetadata>
> = immutableRecord({
	'environment:filesystem': environmentClaimMetadata(
		'Declares direct host filesystem behavior.',
		'sensitive',
	),
	'environment:native-code': environmentClaimMetadata(
		'Declares direct native-code behavior.',
		'critical',
	),
	'environment:network': environmentClaimMetadata(
		'Declares direct host network behavior.',
		'sensitive',
	),
	'environment:process': environmentClaimMetadata(
		'Declares direct host process behavior.',
		'sensitive',
	),
})

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
	readonly capabilities: PluginCapabilityDeclarations
}

const pluginIdPattern =
	/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)$/

/** Package-scoped or dot-namespaced identifier shared by plugin and capability ids. */
export const isPluginIdentifier = (value: string): boolean =>
	pluginIdPattern.test(value)
/** Lists every informational direct-environment claim accepted in manifests. */
export const pluginEnvironmentClaims: readonly PluginEnvironmentClaim[] =
	immutableArray(
		Object.keys(pluginEnvironmentClaimMetadata) as PluginEnvironmentClaim[],
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

/** @internal Snapshots one duplicate-free list drawn from a closed vocabulary. */
export const snapshotVocabularyList = <TValue extends string>(
	values: unknown,
	vocabulary: readonly TValue[],
	messages: Readonly<{
		notArray: string
		unknown: (index: number, value: unknown) => string
		duplicate: (value: TValue) => string
	}>,
): readonly TValue[] => {
	if (!isUnknownArray(values)) throw new TypeError(messages.notArray)
	const normalized = new Set<TValue>()
	for (const [index, value] of values.entries()) {
		const known = vocabulary.find((candidate) => candidate === value)
		if (known === undefined) {
			throw new TypeError(messages.unknown(index, value))
		}
		if (normalized.has(known)) throw new TypeError(messages.duplicate(known))
		normalized.add(known)
	}
	return immutableArray([...normalized])
}

/** Lists every concrete privilege in Core's closed vocabulary. */
export const pluginPrivilegeNames: readonly PluginPrivilege[] = immutableArray(
	Object.keys(pluginPrivilegeMetadata) as PluginPrivilege[],
)

/** @internal Detaches one structured identity without optional-key noise. */
export const snapshotPluginIdentity = (
	identity: PluginIdentity,
): PluginIdentity =>
	immutableRecord({
		pluginId: identity.pluginId,
		...(identity.instanceId === undefined
			? {}
			: { instanceId: identity.instanceId }),
	})

/** @internal Attributes schema and command contributions to one manifest. */
export const pluginContributionOwner = (
	manifest: PluginManifest,
): PluginSchemaContributionOwner =>
	immutableRecord({
		kind: 'plugin' as const,
		pluginId: manifest.identity.pluginId,
		...(manifest.identity.instanceId === undefined
			? {}
			: { instanceId: manifest.identity.instanceId }),
		version: manifest.version,
	})

/** Validates and snapshots one inert plugin manifest without invoking plugin code. */
export const createPluginManifest = (
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

	return immutableRecord({
		identity: snapshotPluginIdentity(options),
		version: options.version,
		core: options.core,
		privileges: immutableArray(options.privileges ?? []),
		environment: snapshotVocabularyList(
			options.environment ?? [],
			pluginEnvironmentClaims,
			{
				notArray: 'environment must be an array',
				unknown: (index) =>
					`environment[${String(index)}] must be a concrete PluginEnvironmentClaim`,
				duplicate: (claim) => `Duplicate plugin environment claim: ${claim}`,
			},
		),
		capabilities: options.capabilities,
	})
}
