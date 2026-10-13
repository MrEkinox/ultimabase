// Application API: plugin installation, schema rule contracts,
// callback authoring types, and policy combinators.
export { accessPlugin } from './plugin.js'
export type {
	AccessPlugin,
	AccessPluginOptions,
	AccessRules,
	AccessSchemaRules,
} from './plugin.js'
export type {
	AllowWithoutRule,
	AllowWithoutRuleValue,
} from './authoring/allow-without-rule.js'
export type { AccessContext } from './context.js'
export type {
	AccessDecisionRule,
	AccessPolicyInput,
	AccessRule,
	AccessRuleResult,
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
	SchemaPermissionAccessMap,
	SchemaReadAccess,
	SchemaUpdateAccess,
	SchemaUpsertAccess,
	SchemaWhereAccessInput,
} from './authoring/contracts.js'
export type {
	SchemaMutationAccess,
	SchemaMutationAccessDeclaration,
	SchemaMutationAccessIdentity,
	SchemaMutationAccessMap,
	SchemaMutationItemAccessInput,
	SchemaMutationOperationAccessInput,
	SchemaMutationWhereAccessInput,
} from './authoring/schema-mutations.js'
export { allOf, anyOf, not } from './authoring/utilities.js'
export type { AccessDecisionInput } from './authoring/utilities.js'

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
