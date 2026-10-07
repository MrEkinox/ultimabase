// Application API: plugin installation, generated schema-option contracts,
// inline callback authoring, request context, and typed event emission.
export { hooksPlugin } from './plugin.js'
export type { HooksPlugin } from './plugin.js'
export type { SchemaHooksOption } from './options.js'

export type {
	HookHandlerDeclaration,
	SaveHookFamily,
	SchemaAfterCreateHook,
	SchemaAfterDeleteHook,
	SchemaAfterHook,
	SchemaAfterMutationHookInput,
	SchemaAfterUpdateHook,
	SchemaAfterUpsertHook,
	SchemaBeforeCreateHook,
	SchemaBeforeCreateHookInput,
	SchemaBeforeDeleteHook,
	SchemaBeforeMutationHook,
	SchemaBeforeMutationHookInput,
	SchemaBeforeOperationHookKind,
	SchemaBeforeUpdateHook,
	SchemaCreateHookKind,
	SchemaDeleteHookKind,
	SchemaHookOperation,
	SchemaHooks,
	SchemaMutationHookKind,
	SchemaMutationItemPair,
	SchemaMutationKind,
	SchemaMutationKindForOperation,
	SchemaOperationHookInput,
	SchemaResolveHook,
	SchemaResolveInputHook,
	SchemaResolveInputHookDeclaration,
	SchemaResolveInputHookInput,
	SchemaSaveHookKind,
	SchemaUpdateHookKind,
	SchemaUpsertHookKind,
} from './authoring/contracts.js'
export type {
	SchemaAfterOperationHooks,
	SchemaBeforeOperationHooks,
	SchemaMutationAfterHook,
	SchemaMutationAfterHookInput,
	SchemaMutationBeforeHook,
	SchemaMutationBeforeHookInput,
	SchemaMutationHookIdentity,
} from './authoring/schema-mutation-contracts.js'
export type {
	FieldCreateHookKind,
	FieldHookDeclaration,
	FieldHookMode,
	FieldHooks,
	FieldHookTypes,
	FieldInputHookInput,
	FieldInputHookKind,
	FieldOutputHookKind,
	FieldResolveInputFamilyHook,
	FieldResolveInputHook,
	FieldResolveInputHookDeclaration,
	FieldUpdateHookKind,
	FieldUpdateInputHookKind,
	FieldUpsertHookKind,
	FieldValueHookInput,
	PresentFieldValue,
} from './authoring/field-contracts.js'
export { HookContext } from './context/hook-context.js'
export type {
	HookEventContract,
	HookEventDelivery,
} from './context/hook-context.js'
export type { HookExecutionContext } from './context/execution-context.js'
export { defineEvent } from './runtime/events.js'
export type {
	DefineEventFactory,
	DefineEventOptions,
} from './runtime/events.js'

// Compatible-provider contract: official phase metadata, contribution
// selectors, capability tokens, and post-commit event consumers.
export { fieldHookPhases } from './authoring/field-declarations.js'
export type { FieldHookPhase } from './authoring/field-declarations.js'
export { schemaHookPhases } from './authoring/declarations.js'
export type { SchemaHookPhase } from './authoring/declarations.js'
export type { FieldAtPath, SchemaFieldPath } from '@ultimabase/core'
export type {
	HookContextIdentity,
	HookContextOwner,
	HookContextTarget,
	HookOperationKind,
} from './context/hook-context.js'
export {
	fieldHooks,
	globalHooks,
	hookContributionsCapability,
	provideHookContributions,
	schemaHooks,
} from './contributions.js'
export type {
	FieldHookContributionDefinition,
	GlobalHookContributionDefinition,
	HookContributionDefinition,
	HookContributionFactory,
	HookContributionFactoryContext,
	HookContributionTargetKind,
	SchemaHookContributionDefinition,
} from './contributions.js'

export {
	hookEventContributionsCapability,
	onEvent,
	provideHookEvent,
} from './runtime/events.js'
export type {
	HookEvent,
	HookEventContributionsCapability,
	HookEventDefinition,
	HookEventHandler,
	HookEventHandlerInput,
	OnEventOptions,
} from './runtime/events.js'

// Conformance support: redacted diagnostics and their optional observer token.
export { hookDiagnosticsObserverCapability } from './runtime/diagnostics.js'
export type {
	HookDiagnosticEvent,
	HookDiagnosticOwner,
	HookDiagnosticPhase,
	HookDiagnosticsObserver,
	HookDiagnosticTarget,
} from './runtime/diagnostics.js'
