import type { CapabilityProviderDeclaration } from './capability-providers.js'
import type { CapabilityRequirement } from './capability-requirements.js'
import type { CapabilityToken } from './capability-token.js'

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

/** Accepts omitted capability groups while preserving exact declaration tuples. */
export interface PluginCapabilityDeclarationOptions {
	readonly provides?: readonly CapabilityProviderDeclaration[]
	readonly requires?: readonly CapabilityRequirement<CapabilityToken, false>[]
	readonly optional?: readonly CapabilityRequirement<CapabilityToken, true>[]
}

type NormalizedProviders<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['provides'] extends readonly CapabilityProviderDeclaration[]
			? readonly [...TOptions['provides']]
			: readonly []
		: readonly []

type NormalizedRequirements<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['requires'] extends readonly CapabilityRequirement<
				CapabilityToken,
				false
			>[]
			? readonly [...TOptions['requires']]
			: readonly []
		: readonly []

type NormalizedOptionalRequirements<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['optional'] extends readonly CapabilityRequirement<
				CapabilityToken,
				true
			>[]
			? readonly [...TOptions['optional']]
			: readonly []
		: readonly []

/** Maps omitted declaration groups to exact immutable empty tuples. */
export type NormalizedPluginCapabilityDeclarations<TOptions> =
	PluginCapabilityDeclarations<
		NormalizedProviders<TOptions>,
		NormalizedRequirements<TOptions>,
		NormalizedOptionalRequirements<TOptions>
	>
