import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	defineCapability,
	provideCapability,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import type { PluginIdentity, PluginPrivilege } from '../../plugins/manifest.js'
import {
	snapshotJsonValue,
	type JsonValue,
} from '../../schema/fields/builtins/json.js'

/** Names the persisted metadata families owned by adapter-specific bridges. */
export type AdapterContributionFamily = 'migration' | 'physical-schema'

/** Carries deterministic adapter metadata before Core attaches its real owner. */
export interface AdapterContributionDefinition<
	TPayload extends JsonValue = JsonValue,
> {
	readonly normalizedStaticOptions: Readonly<Record<string, JsonValue>>
	readonly payload: TPayload
	readonly protocolVersion: number
}

/** Records every fact needed to review physical state after a plugin changes. */
export interface AdapterContributionSnapshot<
	TPayload extends JsonValue = JsonValue,
> extends AdapterContributionDefinition<TPayload> {
	readonly adapterId: string
	readonly contributionId: string
	readonly family: AdapterContributionFamily
	readonly instanceId?: string
	readonly packageVersion: string
	readonly pluginId: string
}

/** Identifies one adapter bridge protocol while preserving exact payload inference. */
export type AdapterContributionCapabilityToken<
	TPayload extends JsonValue = JsonValue,
	TCapabilityId extends string = string,
	TVersion extends string = string,
> = CapabilityToken<
	AdapterContributionDefinition<TPayload>,
	readonly AdapterContributionSnapshot<TPayload>[],
	TCapabilityId,
	TVersion,
	'multiple',
	'application'
>

interface AdapterContributionCapabilityMetadata {
	readonly adapterId: string
	readonly family: AdapterContributionFamily
}

const contributionCapabilities = new WeakMap<
	CapabilityToken,
	AdapterContributionCapabilityMetadata
>()
const contributionProviders = new WeakSet<object>()

/** Configures one adapter-specific physical or migration contribution protocol. */
export interface DefineAdapterContributionCapabilityOptions<
	TCapabilityId extends string,
	TVersion extends string,
> extends AdapterContributionCapabilityMetadata {
	readonly capabilityId: TCapabilityId
	readonly version: TVersion
}

const assertAdapterId: (value: unknown) => asserts value is string = (
	value,
) => {
	if (typeof value !== 'string' || value.length === 0 || !value.includes('.')) {
		throw new TypeError('adapter contribution adapterId must be namespaced')
	}
}

/** Creates one protocol whose consumer receives only Core-attributed snapshots. */
export const defineAdapterContributionCapability =
	<TPayload extends JsonValue>() =>
	<const TCapabilityId extends string, const TVersion extends string>(
		options: DefineAdapterContributionCapabilityOptions<
			TCapabilityId,
			TVersion
		>,
	): AdapterContributionCapabilityToken<TPayload, TCapabilityId, TVersion> => {
		assertAdapterId(options.adapterId)
		const family: unknown = options.family
		if (family !== 'migration' && family !== 'physical-schema') {
			throw new TypeError(
				'adapter contribution family must be migration or physical-schema',
			)
		}
		const token = defineCapability<
			AdapterContributionDefinition<TPayload>,
			readonly AdapterContributionSnapshot<TPayload>[]
		>()({
			capabilityId: options.capabilityId,
			version: options.version,
			cardinality: 'multiple',
			lifetime: 'application',
			// Core replaces provider definitions with attributed snapshots before composition.
			compose: (providers) =>
				immutableArray(
					providers as unknown as readonly AdapterContributionSnapshot<TPayload>[],
				),
		})
		contributionCapabilities.set(
			token,
			immutableRecord({
				adapterId: options.adapterId,
				family: options.family,
			}),
		)
		return token
	}

/** Declares portable metadata while leaving owner attribution to Core. */
export const provideAdapterContribution = <
	TPayload extends JsonValue,
	const TToken extends AdapterContributionCapabilityToken<TPayload>,
>(
	token: TToken,
	options: Readonly<{
		readonly contributionId: string
		readonly normalizedStaticOptions?: Readonly<Record<string, JsonValue>>
		readonly payload: TPayload
		readonly protocolVersion: number
	}>,
): CapabilityProviderDeclaration<TToken> => {
	if (!contributionCapabilities.has(token)) {
		throw new TypeError(
			'adapter contribution token must be created by defineAdapterContributionCapability',
		)
	}
	if (
		!Number.isSafeInteger(options.protocolVersion) ||
		options.protocolVersion < 1
	) {
		throw new TypeError(
			'adapter contribution protocolVersion must be a positive safe integer',
		)
	}
	const definition = immutableRecord({
		normalizedStaticOptions: snapshotJsonValue(
			options.normalizedStaticOptions ?? {},
			'adapter contribution normalizedStaticOptions',
		) as Readonly<Record<string, JsonValue>>,
		payload: snapshotJsonValue(
			options.payload,
			'adapter contribution payload',
		) as TPayload,
		protocolVersion: options.protocolVersion,
	})
	const declaration = provideCapability(
		token as AdapterContributionCapabilityToken,
		{
			contributionId: options.contributionId,
			create: () => ({ value: definition }),
		},
	)
	contributionProviders.add(declaration)
	return declaration as unknown as CapabilityProviderDeclaration<TToken>
}

/** @internal Returns exact provider and consumer privileges for one bridge protocol. */
export const adapterContributionPrivileges = (
	token: CapabilityToken,
):
	| Readonly<{
			readonly consumer: 'adapter:consume'
			readonly provider: PluginPrivilege
	  }>
	| undefined => {
	const metadata = contributionCapabilities.get(token)
	if (metadata === undefined) return undefined
	return immutableRecord({
		consumer: 'adapter:consume' as const,
		provider:
			metadata.family === 'migration'
				? ('migration:contribute' as const)
				: ('adapter:consume' as const),
	})
}

/** @internal Protects adapter metadata from owner claims in generic providers. */
export const isAuthorizedAdapterContributionProvider = (
	declaration: CapabilityProviderDeclaration,
): boolean => contributionProviders.has(declaration)

/** @internal Distinguishes bridge contribution protocols in startup diagnostics. */
export const isAdapterContributionCapability = (
	token: CapabilityToken,
): boolean => contributionCapabilities.has(token)

/** @internal Attaches trusted graph provenance before a token composes values. */
export const materializeAdapterContribution = (
	token: CapabilityToken,
	value: unknown,
	metadata: Readonly<{
		readonly contributionId: string
		readonly owner: PluginIdentity
		readonly packageVersion: string
	}>,
): unknown => {
	const capability = contributionCapabilities.get(token)
	if (capability === undefined) return value
	if (!isPlainRecord(value)) {
		throw new TypeError(
			'adapter contribution provider returned an invalid value',
		)
	}
	return immutableRecord({
		adapterId: capability.adapterId,
		contributionId: metadata.contributionId,
		family: capability.family,
		...(metadata.owner.instanceId === undefined
			? {}
			: { instanceId: metadata.owner.instanceId }),
		normalizedStaticOptions: value.normalizedStaticOptions,
		packageVersion: metadata.packageVersion,
		payload: value.payload,
		pluginId: metadata.owner.pluginId,
		protocolVersion: value.protocolVersion,
	})
}
