export { hooksPlugin } from './plugin.js'
export type { HooksPlugin } from './plugin.js'

export { fieldHooksOption, schemaHooksOption } from './options.js'
export type { FieldHooksOption, SchemaHooksOption } from './options.js'

export type * from './authoring/contracts.js'
export type * from './authoring/field-contracts.js'
export {
	fieldHookPhases,
	normalizeFieldHookDeclarations,
} from './authoring/field-declarations.js'
export type {
	FieldHookDeclarations,
	FieldHookPhase,
} from './authoring/field-declarations.js'
export {
	normalizeSchemaHookDeclarations,
	schemaHookPhases,
} from './authoring/declarations.js'
export type {
	SchemaHookDeclarations,
	SchemaHookPhase,
} from './authoring/declarations.js'
export type { FieldAtPath, SchemaFieldPath } from './authoring/field-paths.js'
export { HookContext } from './context/hook-context.js'
export type {
	HookContextIdentity,
	HookContextOwner,
	HookContextTarget,
	HookEventContract,
	HookEventDelivery,
} from './context/hook-context.js'
export type { HookExecutionContext } from './context/execution-context.js'

export {
	fieldHooks,
	globalHooks,
	hookContributionsCapability,
	provideHookContributions,
	schemaExtensionHooks,
	schemaHooks,
} from './contributions.js'
export type {
	FieldHookContributionDefinition,
	GlobalHookContributionDefinition,
	HookContributionDefinition,
	HookContributionFactory,
	HookContributionFactoryContext,
	HookContributionTargetKind,
	OwnedHookContribution,
	SchemaHookContributionDefinition,
	SchemaExtensionHookContext,
} from './contributions.js'

export {
	defineEvent,
	hookEventContributionsCapability,
	onEvent,
	provideHookEvent,
} from './runtime/events.js'
export type {
	DefineEventFactory,
	DefineEventOptions,
	HookEvent,
	HookEventContributionsCapability,
	HookEventDefinition,
	HookEventHandler,
	HookEventHandlerInput,
	OnEventOptions,
} from './runtime/events.js'
export { hookDiagnosticsObserverCapability } from './runtime/diagnostics.js'
export type {
	HookDiagnosticEvent,
	HookDiagnosticOwner,
	HookDiagnosticPhase,
	HookDiagnosticsObserver,
	HookDiagnosticTarget,
} from './runtime/diagnostics.js'
