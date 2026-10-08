import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { PluginPrivilege } from '../../plugins/manifest.js'
import {
	defineCapability,
	provideCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import type { DatabasePersistencePlanKind } from '../persistence/contracts.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/** Names the independently negotiated portable adapter protocol families. */
export type AdapterCapabilityFamily =
	| 'constraint'
	| 'persistence-plan'
	| 'physical-schema'
	| 'raw'
	| 'value-storage'

/** Identifies one installed adapter without exposing its implementation object. */
export interface AdapterCapabilitySupportBase<
	TFamily extends Exclude<AdapterCapabilityFamily, 'raw'>,
> {
	readonly adapterId: string
	readonly family: TFamily
}

/** Advertises the portable storage formats understood by one adapter. */
export interface AdapterValueStorageSupport extends AdapterCapabilitySupportBase<'value-storage'> {
	readonly formats: readonly ['json']
}

/** Advertises opaque constraint-node compilation support. */
export interface AdapterConstraintSupport extends AdapterCapabilitySupportBase<'constraint'> {
	readonly protocolVersion: 1
}

/** Advertises the physical persistence-plan kinds executable by one adapter. */
export interface AdapterPersistencePlanSupport extends AdapterCapabilitySupportBase<'persistence-plan'> {
	readonly kinds: readonly DatabasePersistencePlanKind[]
	readonly protocolVersion: 1
}

/** Advertises adapter-owned physical schema metadata compilation. */
export interface AdapterPhysicalSchemaSupport extends AdapterCapabilitySupportBase<'physical-schema'> {
	readonly protocolVersion: 1
}

type AdapterSupport =
	| AdapterConstraintSupport
	| AdapterPersistencePlanSupport
	| AdapterPhysicalSchemaSupport
	| AdapterValueStorageSupport

type AdapterSupportToken<TSupport extends AdapterSupport> = CapabilityToken<
	TSupport,
	TSupport,
	string,
	'1.0.0',
	'single',
	'declaration'
>

const adapterCapabilityFamilies = new WeakMap<
	CapabilityToken,
	AdapterCapabilityFamily
>()
const adapterCapabilityProviders = new WeakSet<object>()

const defineSupportCapability = <TSupport extends AdapterSupport>(
	capabilityId: string,
	family: TSupport['family'],
): AdapterSupportToken<TSupport> => {
	const token = defineCapability<TSupport>()({
		capabilityId,
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'declaration',
		compose: ([provider]) => provider,
	})
	adapterCapabilityFamilies.set(token, family)

	return token
}

/** Negotiates portable JSON storage independently from concrete field kinds. */
export const adapterValueStorageCapability: AdapterSupportToken<AdapterValueStorageSupport> =
	defineSupportCapability<AdapterValueStorageSupport>(
		'ultimabase.adapter-value-storage',
		'value-storage',
	)

/** Negotiates opaque protected-constraint compilation. */
export const adapterConstraintCapability: AdapterSupportToken<AdapterConstraintSupport> =
	defineSupportCapability<AdapterConstraintSupport>(
		'ultimabase.adapter-constraint',
		'constraint',
	)

/** Negotiates the exact portable persistence-plan protocol and statement kinds. */
export const adapterPersistencePlanCapability: AdapterSupportToken<AdapterPersistencePlanSupport> =
	defineSupportCapability<AdapterPersistencePlanSupport>(
		'ultimabase.adapter-persistence-plan',
		'persistence-plan',
	)

/** Negotiates adapter-owned physical schema metadata. */
export const adapterPhysicalSchemaCapability: AdapterSupportToken<AdapterPhysicalSchemaSupport> =
	defineSupportCapability<AdapterPhysicalSchemaSupport>(
		'ultimabase.adapter-physical-schema',
		'physical-schema',
	)

const assertAdapterId: (
	value: unknown,
	path: string,
) => asserts value is string = (value, path) => {
	if (typeof value !== 'string' || value.length === 0 || !value.includes('.')) {
		throw new TypeError(`${path} must be a namespaced adapter identifier`)
	}
}

const assertSupport: (
	token: AdapterSupportToken<AdapterSupport>,
	value: unknown,
) => asserts value is AdapterSupport = (token, value) => {
	assertPlainObject(value, 'adapter support must be a plain object')
	assertAdapterId(value.adapterId, 'adapter support adapterId')
	const family = adapterCapabilityFamilies.get(token)
	if (value.family !== family) {
		throw new TypeError(`adapter support family must be ${String(family)}`)
	}

	if (family === 'value-storage') {
		if (
			!isUnknownArray(value.formats) ||
			value.formats.length !== 1 ||
			value.formats[0] !== 'json'
		) {
			throw new TypeError('adapter value storage formats must contain json')
		}
		return
	}

	if (value.protocolVersion !== 1) {
		throw new TypeError(`adapter ${String(family)} protocolVersion must be 1`)
	}
	if (family === 'persistence-plan' && !isUnknownArray(value.kinds)) {
		throw new TypeError('adapter persistence plan kinds must be an array')
	}
}

/** Declares one adapter-owned support provider through the protected factory. */
export const provideAdapterCapability = <
	const TToken extends AdapterSupportToken<AdapterSupport>,
>(
	token: TToken,
	options: Readonly<{
		readonly contributionId: string
		readonly value: TToken extends AdapterSupportToken<infer TSupport>
			? TSupport
			: never
	}>,
): CapabilityProviderDeclaration<TToken> => {
	assertSupport(token, options.value)
	const declaration = provideCapability(
		token as AdapterSupportToken<AdapterSupport>,
		{
			contributionId: options.contributionId,
			value: options.value,
		},
	)
	adapterCapabilityProviders.add(declaration)
	return declaration as unknown as CapabilityProviderDeclaration<TToken>
}

/** @internal Reads privilege semantics for exact adapter capability protocols. */
export const adapterCapabilityPrivilege = (
	token: CapabilityToken,
): PluginPrivilege | undefined =>
	adapterCapabilityFamilies.get(token) === 'raw'
		? 'adapter:raw'
		: adapterCapabilityFamilies.has(token)
			? 'adapter:consume'
			: undefined

/** @internal Protects adapter providers from generic capability construction. */
export const isAuthorizedAdapterCapabilityProvider = (
	declaration: CapabilityProviderDeclaration,
): boolean => adapterCapabilityProviders.has(declaration)

/** @internal Marks adapter-specific raw tokens created by the lease factory. */
export const registerRawAdapterCapability = (token: CapabilityToken): void => {
	adapterCapabilityFamilies.set(token, 'raw')
}

/** @internal Marks raw providers created through the lease-aware helper. */
export const registerRawAdapterProvider = (
	declaration: CapabilityProviderDeclaration,
): void => {
	adapterCapabilityProviders.add(declaration)
}

/** @internal Distinguishes adapter failures from ordinary plugin capabilities. */
export const isAdapterCapability = (token: CapabilityToken): boolean =>
	adapterCapabilityFamilies.has(token)

/** Creates one detached support snapshot for adapter implementations. */
export const adapterSupport = <const TSupport extends AdapterSupport>(
	value: TSupport,
): TSupport => {
	assertAdapterId(value.adapterId, 'adapter support adapterId')
	return immutableRecord({
		...value,
		...(value.family === 'value-storage'
			? { formats: immutableArray(value.formats) }
			: {}),
		...(value.family === 'persistence-plan'
			? { kinds: immutableArray(value.kinds) }
			: {}),
	})
}

/** Narrows adapter requirements for public authoring helpers. */
export type AdapterCapabilityRequirement<
	TToken extends CapabilityToken = CapabilityToken,
> = CapabilityRequirement<TToken>
