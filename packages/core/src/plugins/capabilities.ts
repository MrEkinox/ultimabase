import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { satisfies, validRange } from 'semver'

import { assertExactObjectKeys } from '../exact-object-validation.js'
import {
	assertCapabilityProviderDeclaration,
	type CapabilityProviderDeclaration,
} from './capability-providers.js'
import {
	assertCapabilityToken,
	type CapabilityToken,
} from './capability-token.js'

export {
	assertCapabilityProviderDeclaration,
	provideCapability,
	runApplicationCapabilityFactory,
} from './capability-providers.js'
export type {
	ApplicationCapabilityFactory,
	ApplicationCapabilityFactoryContext,
	ApplicationCapabilityResource,
	CapabilityContributionBase,
	CapabilityProviderContribution,
	CapabilityProviderDeclaration,
	PluginCapabilityReader,
} from './capability-providers.js'
export {
	assertCapabilityToken,
	composeCapability,
	defineCapability,
} from './capability-token.js'
export type {
	CapabilityCardinality,
	CapabilityComposer,
	CapabilityCompositionInput,
	CapabilityConsumerValue,
	CapabilityLifetime,
	CapabilityProviderValue,
	CapabilityToken,
	DefineCapabilityFactory,
	DefineCapabilityOptions,
} from './capability-token.js'

/** Declares one compatible capability use without reading a provider. */
export type CapabilityRequirementPhase = 'materialization' | 'setup'

export interface CapabilityRequirement<
	TToken extends CapabilityToken = CapabilityToken,
	TOptional extends boolean = boolean,
	TRange extends string = string,
	TPhase extends CapabilityRequirementPhase = CapabilityRequirementPhase,
> {
	readonly kind: 'capability-requirement'
	readonly token: TToken
	readonly version: TRange
	readonly optional: TOptional
	/** Selects provider-first materialization or order-independent setup access. */
	readonly phase: TPhase
}

const capabilityRequirements = new WeakSet<object>()
const capabilityRequirementOptionKeys = new Set(['phase'])

/** Selects when an application capability requirement may be consumed. */
export interface CapabilityRequirementOptions<
	TPhase extends CapabilityRequirementPhase = CapabilityRequirementPhase,
> {
	readonly phase: TPhase
}

const normalizeCapabilityRequirementPhase = (
	options: CapabilityRequirementOptions | undefined,
): CapabilityRequirementPhase => {
	if (options === undefined) return 'materialization'

	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capability requirement options must be a plain object')
	}
	assertExactObjectKeys(
		untrustedOptions,
		capabilityRequirementOptionKeys,
		'capability requirement options contains unknown option: ',
	)
	if (
		untrustedOptions.phase !== 'materialization' &&
		untrustedOptions.phase !== 'setup'
	) {
		throw new TypeError(
			'capability requirement phase must be materialization or setup',
		)
	}

	return untrustedOptions.phase
}

const createCapabilityRequirement = <
	const TToken extends CapabilityToken,
	const TOptional extends boolean,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase,
>(
	token: TToken,
	version: TRange,
	optional: TOptional,
	phase: TPhase,
): CapabilityRequirement<TToken, TOptional, TRange, TPhase> => {
	assertCapabilityToken(token, 'capability requirement token')
	assertNonEmptyString(version, 'capability requirement version')
	if (validRange(version) === null) {
		throw new TypeError(
			'capability requirement version must be a valid semantic version range',
		)
	}

	if (!satisfies(token.version, version)) {
		throw new TypeError(
			`Capability token ${token.capabilityId}@${token.version} does not satisfy its declared range ${version}`,
		)
	}

	const requirement = immutableRecord({
		kind: 'capability-requirement' as const,
		token,
		version,
		optional,
		phase,
	})

	capabilityRequirements.add(requirement)
	return requirement
}

/** Declares a capability that must have a compatible provider. */
export const requireCapability = <
	const TToken extends CapabilityToken,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase = 'materialization',
>(
	token: TToken,
	version: TRange,
	options?: CapabilityRequirementOptions<TPhase>,
): CapabilityRequirement<TToken, false, TRange, TPhase> =>
	createCapabilityRequirement(
		token,
		version,
		false,
		normalizeCapabilityRequirementPhase(options) as TPhase,
	)

/** Declares a capability that may be absent but must never be probed implicitly. */
export const optionalCapability = <
	const TToken extends CapabilityToken,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase = 'materialization',
>(
	token: TToken,
	version: TRange,
	options?: CapabilityRequirementOptions<TPhase>,
): CapabilityRequirement<TToken, true, TRange, TPhase> =>
	createCapabilityRequirement(
		token,
		version,
		true,
		normalizeCapabilityRequirementPhase(options) as TPhase,
	)

/** Rejects forged requirements at manifest boundaries. */
export const assertCapabilityRequirement: (
	value: unknown,
	path: string,
) => asserts value is CapabilityRequirement = (value, path) => {
	if (!isPlainRecord(value) || !capabilityRequirements.has(value)) {
		throw new TypeError(
			`${path} must be created by requireCapability or optionalCapability`,
		)
	}
}

/** Narrows privilege conditions to trusted optional requirements only. */
export const assertOptionalCapabilityRequirement: (
	value: unknown,
	path: string,
) => asserts value is CapabilityRequirement<CapabilityToken, true> = (
	value,
	path,
) => {
	assertCapabilityRequirement(value, path)
	if (!value.optional) {
		throw new TypeError(`${path} must be an optional capability requirement`)
	}
}

/** One nominal provider or requirement in author-declared order. */
export type PluginCapabilityDeclaration =
	CapabilityProviderDeclaration | CapabilityRequirement

/** Groups one plugin's inert capability declarations. */
export interface PluginCapabilityDeclarations<
	TProvides extends readonly CapabilityProviderDeclaration[] =
		readonly CapabilityProviderDeclaration[],
	TRequires extends readonly CapabilityRequirement<CapabilityToken, false>[] =
		readonly CapabilityRequirement<CapabilityToken, false>[],
	TOptional extends readonly CapabilityRequirement<CapabilityToken, true>[] =
		readonly CapabilityRequirement<CapabilityToken, true>[],
> {
	readonly provides: TProvides
	readonly requires: TRequires
	readonly optional: TOptional
}

/** Accepts one flat ordered list; each nominal declaration carries its own role. */
export type PluginCapabilityDeclarationOptions =
	readonly PluginCapabilityDeclaration[]

type FilterCapabilityDeclarations<
	TDeclarations extends readonly PluginCapabilityDeclaration[],
	TSelected extends PluginCapabilityDeclaration,
> = TDeclarations extends readonly []
	? readonly []
	: TDeclarations extends readonly [
				infer THead extends PluginCapabilityDeclaration,
				...infer TTail extends readonly PluginCapabilityDeclaration[],
		  ]
		? THead extends TSelected
			? readonly [THead, ...FilterCapabilityDeclarations<TTail, TSelected>]
			: FilterCapabilityDeclarations<TTail, TSelected>
		: readonly Extract<TDeclarations[number], TSelected>[]

type NormalizedRequirements<TOptions> =
	TOptions extends readonly PluginCapabilityDeclaration[]
		? FilterCapabilityDeclarations<
				TOptions,
				CapabilityRequirement<CapabilityToken, false>
			>
		: readonly []

type NormalizedOptionalRequirements<TOptions> =
	TOptions extends readonly PluginCapabilityDeclaration[]
		? FilterCapabilityDeclarations<
				TOptions,
				CapabilityRequirement<CapabilityToken, true>
			>
		: readonly []

type NormalizedProviders<TOptions> =
	TOptions extends readonly PluginCapabilityDeclaration[]
		? FilterCapabilityDeclarations<TOptions, CapabilityProviderDeclaration>
		: readonly []

/** Maps omitted declaration groups to exact immutable empty tuples. */
export type NormalizedPluginCapabilityDeclarations<TOptions> =
	PluginCapabilityDeclarations<
		NormalizedProviders<TOptions>,
		NormalizedRequirements<TOptions>,
		NormalizedOptionalRequirements<TOptions>
	>

const assertRequiredCapabilityRequirement: (
	value: CapabilityRequirement,
) => asserts value is CapabilityRequirement<CapabilityToken, false> = (
	value,
) => {
	if (value.optional) {
		throw new TypeError('required capability declaration cannot be optional')
	}
}

/** Snapshots one flat capability list into the stable inspection buckets. */
export const normalizeCapabilityDeclarations = (
	options: PluginCapabilityDeclarationOptions | undefined,
): PluginCapabilityDeclarations => {
	if (options === undefined) {
		return immutableRecord({
			provides: immutableArray([]),
			requires: immutableArray([]),
			optional: immutableArray([]),
		})
	}

	const untrustedOptions: unknown = options
	if (!isUnknownArray(untrustedOptions)) {
		throw new TypeError('capabilities must be an array')
	}

	const provides: CapabilityProviderDeclaration[] = []
	const requires: CapabilityRequirement<CapabilityToken, false>[] = []
	const optional: CapabilityRequirement<CapabilityToken, true>[] = []
	for (const [index, declaration] of untrustedOptions.entries()) {
		const path = `capabilities[${String(index)}]`
		if (!isPlainRecord(declaration)) {
			throw new TypeError(
				`${path} must be created by provideCapability, requireCapability, or optionalCapability`,
			)
		}

		if (declaration.kind === 'capability-provider') {
			assertCapabilityProviderDeclaration(declaration, path)
			provides.push(declaration)
			continue
		}
		if (declaration.kind === 'capability-requirement') {
			assertCapabilityRequirement(declaration, path)
			if (declaration.optional) {
				assertOptionalCapabilityRequirement(declaration, path)
				optional.push(declaration)
			} else {
				assertRequiredCapabilityRequirement(declaration)
				requires.push(declaration)
			}
			continue
		}

		throw new TypeError(
			`${path} must be created by provideCapability, requireCapability, or optionalCapability`,
		)
	}

	return immutableRecord({
		provides: immutableArray(provides),
		requires: immutableArray(requires),
		optional: immutableArray(optional),
	})
}
