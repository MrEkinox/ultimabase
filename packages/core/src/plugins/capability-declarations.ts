import type { CapabilityProviderDeclaration } from './capability-providers.js'
import type { CapabilityRequirement } from './capability-requirements.js'
import type { CapabilityToken } from './capability-token.js'

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

/** @internal Temporary milestone-33 input retained only while packages migrate. */
interface GroupedPluginCapabilityDeclarationOptions {
	readonly provides?: readonly CapabilityProviderDeclaration[]
	readonly requires?: readonly CapabilityRequirement<CapabilityToken, false>[]
	readonly optional?: readonly CapabilityRequirement<CapabilityToken, true>[]
}

/** Accepts one flat ordered list; each nominal declaration carries its own role. */
export type PluginCapabilityDeclarationOptions =
	| readonly PluginCapabilityDeclaration[]
	| GroupedPluginCapabilityDeclarationOptions

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
		: TOptions extends GroupedPluginCapabilityDeclarationOptions
			? TOptions['requires'] extends readonly CapabilityRequirement<
					CapabilityToken,
					false
				>[]
				? readonly [...TOptions['requires']]
				: readonly []
			: readonly []

type NormalizedOptionalRequirements<TOptions> =
	TOptions extends readonly PluginCapabilityDeclaration[]
		? FilterCapabilityDeclarations<
				TOptions,
				CapabilityRequirement<CapabilityToken, true>
			>
		: TOptions extends GroupedPluginCapabilityDeclarationOptions
			? TOptions['optional'] extends readonly CapabilityRequirement<
					CapabilityToken,
					true
				>[]
				? readonly [...TOptions['optional']]
				: readonly []
			: readonly []

type NormalizedProviders<TOptions> =
	TOptions extends readonly PluginCapabilityDeclaration[]
		? FilterCapabilityDeclarations<TOptions, CapabilityProviderDeclaration>
		: TOptions extends GroupedPluginCapabilityDeclarationOptions
			? TOptions['provides'] extends readonly CapabilityProviderDeclaration[]
				? readonly [...TOptions['provides']]
				: readonly []
			: readonly []

/** Maps omitted declaration groups to exact immutable empty tuples. */
export type NormalizedPluginCapabilityDeclarations<TOptions> =
	PluginCapabilityDeclarations<
		NormalizedProviders<TOptions>,
		NormalizedRequirements<TOptions>,
		NormalizedOptionalRequirements<TOptions>
	>
