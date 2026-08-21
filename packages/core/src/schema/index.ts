export { bigintField } from './fields/builtins/bigint.js'
export type {
	BigintField,
	BigintFieldOptions,
	BigintRangeValidationOptions,
	BigintValidationOptions,
} from './fields/builtins/bigint.js'
export { binaryField } from './fields/builtins/binary.js'
export type {
	BinaryField,
	BinaryFieldOptions,
	BinaryLengthValidationOptions,
	BinaryValidationOptions,
} from './fields/builtins/binary.js'
export { booleanField } from './fields/builtins/boolean.js'
export type {
	BooleanField,
	BooleanFieldOptions,
	BooleanValidationOptions,
} from './fields/builtins/boolean.js'
export { objectField } from './fields/builtins/object.js'
export type {
	ObjectField,
	ObjectFieldOptions,
	ObjectFields,
	ObjectFieldValue,
} from './fields/builtins/object.js'
export { pointerField } from './fields/builtins/pointer.js'
export type {
	PointerField,
	PointerFieldMetadataOptions,
	PointerFieldOptions,
	PointerReferentialAction,
	SchemaPointerFieldName,
	SchemaPointerTarget,
} from './fields/builtins/pointer.js'
export { relationField } from './fields/builtins/relation.js'
export type {
	RelationField,
	RelationFieldTypegenState,
	RelationFieldMetadataOptions,
	RelationFieldOptions,
	RelationMappedFieldName,
} from './fields/builtins/relation.js'
export { Pointer, snapshotPointerValue } from './relations/pointer.js'
export type {
	GeneratedPointerHandle,
	PointerJSON,
	PointerTarget,
	PointerValue,
} from './relations/pointer.js'
export { Relation } from './relations/relation.js'
export type {
	SchemaRelationFieldName,
	SchemaRelationTarget,
} from './relations/relation.js'
export type {
	RelationMutationAction,
	RelationMutationDelta,
	RelationMutationOptions,
	RelationMutationTargets,
	RelationUpdateExpression,
	RelationUpdateOperationNode,
} from './relations/mutation.js'
export { isRelationUpdateExpression } from './relations/mutation.js'
export { definePluginField } from './fields/plugin.js'
export type {
	PluginFieldDefinition,
	PluginFieldNormalizers,
	PluginFieldStructuralContains,
	AvailablePluginFieldKind,
	ReservedFieldKind,
} from './fields/plugin.js'
export { dateField } from './fields/builtins/date.js'
export type {
	DateField,
	DateFieldOptions,
	DateRangeValidationOptions,
	DateValidationOptions,
} from './fields/builtins/date.js'
export { decimalField } from './fields/builtins/decimal.js'
export type {
	DecimalField,
	DecimalFieldOptions,
	DecimalRangeValidationOptions,
	DecimalValidationOptions,
} from './fields/builtins/decimal.js'
export { dateTimeField } from './fields/builtins/date-time.js'
export type {
	DateTimeField,
	DateTimeFieldOptions,
	DateTimeRangeValidationOptions,
	DateTimeValidationOptions,
} from './fields/builtins/date-time.js'
export { isStaticDefault } from './fields/base/defaults.js'
export type { DefaultFactory, FieldDefault } from './fields/base/defaults.js'
export {
	assertFieldDefinition,
	getPluginFieldStructuralContains,
	getPluginFieldStorageCodec,
	isFieldRequiredDeferred,
	snapshotScalarFieldValue,
} from './fields/base/definition.js'
export { pluginFieldStructuralContainsProtocolVersion } from './fields/base/definition.js'
export type {
	PluginFieldStorageCodec,
	PluginFieldStructuralContainsMetadata,
} from './fields/base/definition.js'
export type { FieldValueMap } from './fields/base/value-map.js'
export { enumField } from './fields/builtins/enum.js'
export type {
	EnumField,
	EnumFieldOptions,
	EnumValue,
	EnumValues,
} from './fields/builtins/enum.js'
export {
	defineContextualSchemaExtensionFactory,
	defineExtensions,
	defineFieldExtension,
	defineSchemaExtension,
} from './extensions/definition.js'
export type {
	ContextualSchemaExtensionFactory,
	ContextualSchemaExtensionOptions,
	ContextualSchemaExtensionResult,
	ExtensionDefinition,
	ExtensionScope,
	FieldExtension,
	SchemaExtensionBindingContext,
	SchemaExtensionContextKind,
	SchemaExtension,
	SchemaExtensionContributions,
	SchemaExtensionFields,
} from './extensions/definition.js'
export type {
	FieldDefinition,
	FieldTypegenPresence,
	FieldTypegenState,
	FieldTypegenStateOf,
	GenericField,
	FieldList,
	FieldListOption,
	FieldListValue,
	FieldOptionValueCarrier,
	FieldOptions,
	FieldOptionsValue,
	FieldScalarValue,
	FieldStructuralContainsOperand,
	FieldValidationOptions,
	FieldOptionsWithoutNullable,
	FieldValue,
	ResolveFieldTypegenState,
	ScalarFieldTypegenState,
	ValidatedFieldOptions,
} from './fields/base/contract.js'
export type { FieldValueMode } from './fields/base/value-map.js'
export type { FieldAtPath, SchemaFieldPath } from './fields/paths.js'
export {
	assertFieldOptions,
	getFieldListDepth,
	readFieldTypegenState,
} from './fields/base/options.js'
export { intField } from './fields/builtins/int.js'
export type {
	IntField,
	IntFieldOptions,
	IntRangeValidationOptions,
	IntValidationOptions,
} from './fields/builtins/int.js'
export { jsonField } from './fields/builtins/json.js'
export type {
	JsonArray,
	JsonDocument,
	JsonField,
	JsonFieldOptions,
	JsonObject,
	JsonPrimitive,
	JsonValue,
} from './fields/builtins/json.js'
export { floatField } from './fields/builtins/float.js'
export type {
	FloatField,
	FloatFieldOptions,
	FloatRangeValidationOptions,
	FloatValidationOptions,
} from './fields/builtins/float.js'
export { Schema, SchemaCompilationError } from './schema/definition.js'
export { defineSchemaConstraint } from './schema/constraints.js'
export type { SchemaConstraintDefinition } from './schema/constraints.js'
export type {
	SchemaCreateData,
	SchemaItem,
	SchemaUpdateData,
} from './schema/values.js'
export type {
	BaseItem,
	SchemaAPI,
	SchemaClass,
	SchemaClassCapabilities,
	SchemaClassCapabilityFactory,
	SchemaDefinition,
	SchemaExtensionData,
	SchemaExtensionDeclaration,
	SchemaReference,
	ResolvedSchemaFields,
	SchemaExtensionFields as ResolvedSchemaExtensionFields,
	SchemaExtensions,
	SchemaFields,
	SchemaCompilationFailureReason,
	SchemaMetadata,
	SchemaOptions,
	SchemaStaticCapabilities,
	SchemaStaticCapabilityFactory,
} from './schema/definition.js'
export type {
	AppliedSchemaPatchProvenance,
	ApplicationSchemaContributionOwner,
	CoreSchemaContributionOwner,
	PluginSchemaContributionOwner,
	SchemaCompilationProvenance,
	SchemaConstraintProvenance,
	SchemaContributionOwner,
	SchemaContributionOwnerReference,
	SchemaContributionProvenance,
	SchemaExtensionProvenance,
	SchemaIndexProvenance,
	SchemaOptionProvenance,
} from './schema/provenance.js'
export type {
	EmbeddedFieldBuilder,
	FieldBuilder,
	ObjectFieldBuilderOptions,
	SchemaFieldBuilderDeclaration,
} from './schema/field-builder.js'
export { defineFieldBuilderMethod } from './schema/field-builder-methods.js'
export type {
	FieldBuilderMethodDefinition,
	FieldBuilderMethodFactory,
	FieldBuilderMethodRegistrar,
	FieldBuilderMethodTypegen,
	OwnedFieldBuilderMethod,
} from './schema/field-builder-methods.js'
export type {
	BaseSchemaTypeInfo,
	BaseSchemaInputsTypeInfo,
	SchemaTypeInfoByName,
	SchemaTypeInfoByNameOrBase,
	SchemaTypeInfoFor,
	SchemaTypeInfo,
	SchemaTypeInfoCarrier,
	SchemaTypeInfoSource,
	SchemaInputsTypeInfo,
	SchemaNumericFieldName,
	SchemaRelationshipTypeInfo,
	SchemaRelationshipFieldName,
	SchemaRelationshipTargetName,
	SchemaTypeValueKey,
	SchemaTypeValue,
	HasUltimaBaseGeneratedRegistry,
	RequireGeneratedSchemaEntry,
	UltimaBaseGeneratedEmbeddedFieldBuilderMethods,
	UltimaBaseGeneratedFieldBuilderMethods,
	UltimaBaseGeneratedFieldOptions,
	UltimaBaseGeneratedOperations,
	UltimaBaseGeneratedRegistryState,
	UltimaBaseGeneratedSchemaOptions,
	UltimaBaseGeneratedSchemaName,
	UltimaBaseGeneratedSchemas,
	UltimaBaseGeneratedSchemaSurfaces,
} from './type-info.js'
export { generatedApplicationContractVersion } from './type-info.js'
export type {
	CompactSchemaModelUpdateInput,
	PersistedSchemaModel,
	PersistedSchemaReference,
	SchemaDraft,
	SchemaDraftCommands,
	SchemaDraftUpsertFields,
	SchemaDraftUpsertInput,
	SchemaModelCreateInput,
	SchemaModelDeleteInput,
	SchemaModelFetchInput,
	SchemaModelUpdateCommandInput,
	SchemaModelUpdateInput,
	SchemaModelSelection,
	SchemaModelCapabilityContext,
	SchemaPreparedDraft,
	SchemaResultCapabilitiesOf,
	SchemaResultCapabilityCarrier,
	SchemaResult,
	SchemaResultCommands,
	SchemaResultRelations,
} from './schema/model.js'
export {
	materializePreparedSchemaDraft,
	materializeSchemaModel,
} from './schema/model-materialization.js'
export type {
	SchemaFieldName,
	SchemaIndexDefinition,
	SchemaIndexOptions,
} from './schema/indexes.js'
export { DuplicateSchemaError, SchemaRegistry } from './schema/registry.js'
export type { CompiledSchemaRegistry } from './schema/registry.js'
export { SchemaTargetResolutionError } from './schema/targets.js'
export type {
	ResolvedSchemaTarget,
	SchemaTarget,
	SchemaTargetGraph,
	SchemaTargetResolutionReason,
} from './schema/targets.js'
export { SchemaRelationMappingError } from './relations/mapping.js'
export type {
	ResolvedSchemaRelation,
	ResolvedSchemaRelationMapping,
	SchemaRelationMappingReason,
	SchemaRelationOwnership,
} from './relations/mapping.js'
export { stringField } from './fields/builtins/string.js'
export type {
	StringField,
	StringFieldOptions,
	StringLengthValidationOptions,
	StringValidationOptions,
} from './fields/builtins/string.js'
export { timeField } from './fields/builtins/time.js'
export type {
	TimeField,
	TimeFieldOptions,
	TimeRangeValidationOptions,
	TimeValidationOptions,
} from './fields/builtins/time.js'
export { uuidField } from './fields/builtins/uuid.js'
export type {
	UuidField,
	UuidFieldOptions,
	UuidValidationOptions,
	UuidVersion,
} from './fields/builtins/uuid.js'
export type {
	CreatedAtSystemField,
	IdSystemField,
	ReservedSystemFieldName,
	SystemFieldDefinition,
	SystemFieldGeneration,
	SystemFieldOptions,
	SystemFields,
	UpdatedAtSystemField,
} from './schema/system-fields.js'
export { compileValidationPlans } from './plans/compiler.js'
export {
	fieldUsesTemporalTimezone,
	validateScalarFieldConstraints,
} from './plans/scalar-validation.js'
export type {
	ArrayValidationPlan,
	AnyValidationIssueCode,
	FieldValidationPlan,
	ObjectValidationPlan,
	PluginValidationIssueCode,
	ScalarValidationPlan,
	SchemaValidationPlan,
	SchemaValidationPlans,
	UnknownFieldPolicy,
	ValidationIssue,
	ValidationIssueCode,
	ValidationIssuePath,
	ValidationOperation,
	ValidationPresence,
} from './plans/contracts.js'
