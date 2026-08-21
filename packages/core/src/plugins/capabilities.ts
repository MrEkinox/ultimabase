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
	CapabilityContributionTarget,
	CapabilityProviderContribution,
	CapabilityProviderDeclaration,
	PluginCapabilityReader,
} from './capability-providers.js'
export {
	assertCapabilityDecoratorDeclaration,
	assertCapabilityReplacementDeclaration,
	decorateCapability,
	replaceCapability,
	runCapabilityDecorator,
} from './capability-replacements.js'
export type {
	CapabilityDecoratorDeclaration,
	CapabilityReplacementDeclaration,
} from './capability-replacements.js'
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
	typegenEmitterCapability,
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
	TypegenEmitterCapability,
} from './capability-token.js'
