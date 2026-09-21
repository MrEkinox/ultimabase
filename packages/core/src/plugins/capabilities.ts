export { normalizeCapabilityDeclarations } from './capability-declaration-normalization.js'
export type {
	NormalizedPluginCapabilityDeclarations,
	PluginCapabilityDeclarationOptions,
	PluginCapabilityDeclarations,
} from './capability-declarations.js'
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
	assertCapabilityRequirement,
	assertOptionalCapabilityRequirement,
	optionalCapability,
	requireCapability,
} from './capability-requirements.js'
export type {
	CapabilityRequirement,
	CapabilityRequirementOptions,
	CapabilityRequirementPhase,
} from './capability-requirements.js'
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
