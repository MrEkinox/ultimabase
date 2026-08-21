// Application API: plugin installation, generated option contracts, callback
// authoring types, and policy combinators.
export { accessPlugin } from './plugin.js'
export type { AccessPlugin, AccessPluginOptions } from './plugin.js'
export type { FieldAccessOption, SchemaAccessOption } from './options.js'
export type { AccessContext } from './context.js'
export type {
	AccessDecisionRule,
	AccessWhereRule,
	FieldAccess,
	FieldAccessDeclaration,
	FieldAccessInput,
	FieldAccessFor,
	FieldClearAccessInput,
	FieldFillAccessInput,
	FieldReadAccess,
	FieldReadAccessFor,
	FieldReadAccessDeclaration,
	FieldReplaceAccessInput,
	FieldValueAccessInput,
	FieldWriteAccess,
	FieldWriteAccessFor,
	FieldWriteAccessDeclaration,
	RelationFieldAccess,
	RelationFieldWriteAccessInput,
	SchemaAccess,
	SchemaCreateAccess,
	SchemaDeleteAccess,
	SchemaItemAccessInput,
	SchemaOperationAccessDeclaration,
	SchemaOperationAccessInput,
	SchemaReadAccess,
	SchemaReadAllowAccess,
	SchemaReadAllowAccessDeclaration,
	SchemaUpdateAccess,
	SchemaUpsertAccess,
	SchemaWhereAccessInput,
} from './authoring/contracts.js'
export {
	allMutations,
	allOf,
	allOperations,
	allowAll,
	anyOf,
	denyAll,
	not,
} from './authoring/utilities.js'
export type {
	AccessDecisionInput,
	AllMutationAccess,
	AllOperationAccess,
	OperationAccessRule,
} from './authoring/utilities.js'

// Compatible-provider contract: official contribution targets, factories,
// definitions, and the versioned capability token consumed by the engine.
export {
	accessContributionsCapability,
	fieldAccess,
	fieldKindAccess,
	globalAccess,
	provideAccessContributions,
	schemaAccess,
} from './contributions.js'
export type {
	AccessContributionDefinition,
	AccessContributionFactory,
	AccessContributionFactoryContext,
	AccessContributionsCapability,
	FieldAccessContributionDefinition,
	GlobalAccessContributionDefinition,
	SchemaAccessContributionDefinition,
} from './contributions.js'
export { defineFieldKindAccessTarget } from './targets.js'
export type {
	FieldKindAccessContributionDefinition,
	FieldKindAccessTarget,
	FieldKindAccessTargetContext,
} from './targets.js'

// Conformance support: redacted diagnostics and their optional observer token.
export { accessDiagnosticsObserverCapability } from './runtime/diagnostics.js'
export type {
	AccessDiagnosticEvent,
	AccessDiagnosticIdentity,
	AccessDiagnosticsObserver,
	AccessDiagnosticsObserverCapability,
} from './runtime/diagnostics.js'
