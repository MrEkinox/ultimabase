import type {
	CapabilityDecoratorDeclaration,
	CapabilityProviderDeclaration,
	CapabilityReplacementDeclaration,
	CapabilityRequirement,
	CapabilityToken,
} from './capabilities.js'

/** Groups one plugin's inert capability declarations. */
export interface PluginCapabilityDeclarations<
	TProvides extends readonly CapabilityProviderDeclaration[] =
		readonly CapabilityProviderDeclaration[],
	TDecorates extends readonly CapabilityDecoratorDeclaration[] =
		readonly CapabilityDecoratorDeclaration[],
	TReplaces extends readonly CapabilityReplacementDeclaration[] =
		readonly CapabilityReplacementDeclaration[],
	TRequires extends readonly CapabilityRequirement<CapabilityToken, false>[] =
		readonly CapabilityRequirement<CapabilityToken, false>[],
	TOptional extends readonly CapabilityRequirement<CapabilityToken, true>[] =
		readonly CapabilityRequirement<CapabilityToken, true>[],
> {
	readonly provides: TProvides
	readonly decorates: TDecorates
	readonly replaces: TReplaces
	readonly requires: TRequires
	readonly optional: TOptional
}

/** Accepts omitted capability groups while preserving exact declaration tuples. */
export interface PluginCapabilityDeclarationOptions {
	readonly provides?: readonly CapabilityProviderDeclaration[]
	readonly decorates?: readonly CapabilityDecoratorDeclaration[]
	readonly replaces?: readonly CapabilityReplacementDeclaration[]
	readonly requires?: readonly CapabilityRequirement<CapabilityToken, false>[]
	readonly optional?: readonly CapabilityRequirement<CapabilityToken, true>[]
}

type NormalizedProviders<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['provides'] extends readonly CapabilityProviderDeclaration[]
			? readonly [...TOptions['provides']]
			: readonly []
		: readonly []

type NormalizedDecorators<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['decorates'] extends readonly CapabilityDecoratorDeclaration[]
			? readonly [...TOptions['decorates']]
			: readonly []
		: readonly []

type NormalizedReplacements<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['replaces'] extends readonly CapabilityReplacementDeclaration[]
			? readonly [...TOptions['replaces']]
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
		NormalizedDecorators<TOptions>,
		NormalizedReplacements<TOptions>,
		NormalizedRequirements<TOptions>,
		NormalizedOptionalRequirements<TOptions>
	>
