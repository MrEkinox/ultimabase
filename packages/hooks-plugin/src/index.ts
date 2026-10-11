// Application API: plugin installation, schema rule contracts, inline
// callback authoring, request context, and typed events.
export { hooksPlugin } from './plugin.js'
export type {
	HooksPlugin,
	HooksPluginOptions,
	HooksRules,
	HooksSchemaRules,
	SchemaHooksOption,
} from './plugin.js'

export type {
	HookChanges,
	HookCreateData,
	HookHandlerDeclaration,
	HookRelationChanges,
	SaveHookFamily,
	SchemaAfterCreateHookInput,
	SchemaAfterDeleteHookInput,
	SchemaAfterOperationHookInput,
	SchemaAfterUpdateHookInput,
	SchemaAfterUpsertHookInput,
	SchemaBeforeCreateHookInput,
	SchemaBeforeDeleteHookInput,
	SchemaBeforeOperationHookInput,
	SchemaBeforeUpdateHookInput,
	SchemaBeforeUpsertHookInput,
	SchemaHooks,
	SchemaMutationKind,
	SchemaOperationHook,
	SchemaResolveCreateHook,
	SchemaResolveCreateInput,
	SchemaResolveInputHook,
	SchemaResolveInputHookDeclaration,
	SchemaResolveInputHookInput,
	SchemaResolveUpdateHook,
	SchemaResolveUpdateInput,
	SchemaResolveUpsertHook,
	SchemaResolveUpsertInput,
	SchemaUpsertResolution,
} from './authoring/contracts.js'
export type {
	SchemaAfterCommitHooks,
	SchemaAfterOperationHooks,
	SchemaBeforeOperationHooks,
	SchemaMutationAfterHook,
	SchemaMutationAfterHookInput,
	SchemaMutationAllHookInput,
	SchemaMutationBeforeHook,
	SchemaMutationBeforeHookInput,
	SchemaMutationHookIdentity,
} from './authoring/schema-mutation-contracts.js'
export type {
	GlobalAfterOperationHookInput,
	GlobalBeforeOperationHookInput,
	GlobalCommandHookInput,
	GlobalHookItem,
	GlobalHooks,
	GlobalOperationHooks,
	GlobalResolveInputHookInput,
} from './authoring/global-contracts.js'
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
	HookExecutionContext,
} from './context/hook-context.js'
export { defineEvent, onEvent } from './runtime/events.js'
export type {
	HookEvent,
	HookEventDefinition,
	HookEventHandler,
	HookEventHandlerInput,
} from './runtime/events.js'

// Compatible-provider contract: official phase metadata, contribution
// selectors, capability tokens, and post-commit event consumers.
export { fieldHookPhases, schemaHookPhases } from './authoring/declarations.js'
export type {
	FieldHookPhase,
	SchemaHookPhase,
} from './authoring/declarations.js'
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
	provideHookEvent,
} from './runtime/events.js'
export type { HookEventContributionsCapability } from './runtime/events.js'
export { readHookInternals } from './runtime/planned-handlers.js'
export type { HookInternals } from './runtime/planned-handlers.js'

// Conformance support: redacted diagnostics and their optional observer token.
export { hookDiagnosticsObserverCapability } from './runtime/diagnostics.js'
export type {
	HookDiagnosticEvent,
	HookDiagnosticOwner,
	HookDiagnosticPhase,
	HookDiagnosticsObserver,
	HookDiagnosticTarget,
} from './runtime/diagnostics.js'
