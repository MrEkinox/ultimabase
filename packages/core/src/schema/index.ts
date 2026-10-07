export { bigintField } from './fields/builtins/bigint.js'
export type {
	BigintField,
	BigintFieldOptions,
} from './fields/builtins/bigint.js'
export { binaryField } from './fields/builtins/binary.js'
export type {
	BinaryField,
	BinaryFieldOptions,
} from './fields/builtins/binary.js'
export { booleanField } from './fields/builtins/boolean.js'
export type {
	BooleanField,
	BooleanFieldOptions,
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
	RelationWhere,
	RelationWhereResolver,
	RelationWhereResolverInput,
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
export type { DateField, DateFieldOptions } from './fields/builtins/date.js'
export { decimalField } from './fields/builtins/decimal.js'
export type {
	DecimalField,
	DecimalFieldOptions,
} from './fields/builtins/decimal.js'
export { dateTimeField } from './fields/builtins/date-time.js'
export type {
	DateTimeField,
	DateTimeFieldOptions,
} from './fields/builtins/date-time.js'
export { isStaticDefault } from './fields/base/defaults.js'
export type { DefaultFactory, FieldDefault } from './fields/base/defaults.js'
export {
	assertFieldDefinition,
	definePluginFieldWireProtocol,
	getPluginFieldStructuralContains,
	getPluginFieldStorageCodec,
	getPluginFieldWireCodec,
	getFieldSchemaTarget,
	isFieldRequiredDeferred,
	pluginFieldStructuralContainsProtocolVersion,
	readFieldTypegenState,
	snapshotScalarFieldValue,
} from './fields/base/definition.js'
export type {
	PluginFieldStorageCodec,
	PluginFieldWireCodec,
	PluginFieldWireProtocol,
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
export type {
	FieldDefinition,
	CompatibleFieldOptions,
	CompatibleFieldOptionsExtension,
	CompatibleFieldOptionsInput,
	CompatiblePluginSourceFieldOptions,
	FieldTypegenPresence,
	FieldTypegenState,
	FieldTypegenStateOf,
	ForbiddenMutationInputField,
	GenericField,
	FieldList,
	FieldListOption,
	FieldListValue,
	FieldOptionValueCarrier,
	FieldOptions,
	FieldOptionsValue,
	PluginSourceFieldOption,
	PluginSourceFieldOptionConstraint,
	FieldScalarValue,
	FieldStructuralContainsOperand,
	FieldValue,
	ResolveFieldTypegenState,
	ScalarFieldTypegenState,
	ValidatedFieldOptions,
} from './fields/base/contract.js'
export type { FieldValueMode } from './fields/base/value-map.js'
export type { FieldAtPath, SchemaFieldPath } from './fields/paths.js'
export { assertFieldOptions, getFieldListDepth } from './fields/base/options.js'
export { intField } from './fields/builtins/int.js'
export type { IntField, IntFieldOptions } from './fields/builtins/int.js'
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
export type { FloatField, FloatFieldOptions } from './fields/builtins/float.js'
export { Schema } from './schema/definition.js'
export { SchemaCompilationError } from './schema/definition-compilation.js'
export type { SchemaCompilationFailureReason } from './schema/definition-compilation.js'
export { defineSchemaConstraint } from './schema/constraints.js'
export type { SchemaConstraintDefinition } from './schema/constraints.js'
export type {
	SchemaCreateData,
	SchemaItem,
	SchemaOutput,
	SchemaUpdateData,
} from './schema/values.js'
export type {
	NestedPointerCreateInput,
	NestedPointerUpdateInput,
	NestedRelationCreateInput,
	NestedRelationUpdateInput,
	NestedRelationUpdateItemInput,
	NestedWriteNonEmptyArray,
	SchemaNestedCreateData,
	SchemaNestedUpdateData,
} from './nested-writes/inputs.js'
export { normalizeNestedWriteGraph } from './nested-writes/normalization.js'
export { transformSchemaMutationDataInput } from './nested-writes/input-transformation.js'
export type {
	SchemaMutationDataFieldInput,
	SchemaMutationDataTransformOptions,
} from './nested-writes/input-transformation.js'
export {
	defaultNestedWriteLimits,
	normalizeNestedWriteLimits,
} from './nested-writes/limits.js'
export type {
	NestedWriteGraph,
	NestedWriteInputPath,
	NestedWriteLimits,
	NestedWriteNodeProvenance,
	NestedWriteObjectNode,
	NestedWritePointerNode,
	NestedWriteRelationNode,
	NestedWriteRelationshipCommand,
	NestedWriteRelationshipNode,
	NestedWriteRootCommand,
} from './nested-writes/contracts.js'
export type {
	BaseItem,
	ConfiguredFieldDeclaration,
	ConfiguredSchemaDeclarationOptions,
	ConfiguredSchemaNamespace,
	ConfiguredSchemaResult,
	SchemaAPI,
	SchemaClass,
	SchemaClassCapabilities,
	SchemaClassCapabilityFactory,
	SchemaDefinition,
	SchemaDeclaredFields,
	SchemaReference,
	SchemaFields,
	SchemaVirtualFields,
	SchemaMetadata,
	SchemaOptions,
	SchemaStaticCapabilities,
} from './schema/definition.js'
export type { ReservedSchemaFieldCollision } from './schema/reserved-field-names.js'
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
	SchemaIndexProvenance,
	SchemaOptionProvenance,
} from './schema/provenance.js'
export type {
	EmbeddedBigintFieldOptions,
	EmbeddedBinaryFieldOptions,
	EmbeddedBooleanFieldOptions,
	EmbeddedDateFieldOptions,
	EmbeddedDateTimeFieldOptions,
	EmbeddedDecimalFieldOptions,
	EmbeddedEnumFieldOptions,
	EmbeddedFloatFieldOptions,
	EmbeddedIntFieldOptions,
	EmbeddedJsonFieldOptions,
	EmbeddedStringFieldOptions,
	EmbeddedTimeFieldOptions,
	EmbeddedUuidFieldOptions,
} from './schema/embedded-field-options.js'
export type {
	EmbeddedFieldBuilder,
	FieldBuilder,
	ObjectFieldBuilderOptions,
	SchemaFieldBuilderDeclaration,
} from './schema/field-builder.js'
export type {
	EmbeddedObjectFieldBuilderMethod,
	EmbeddedObjectFieldBuilderOptions,
} from './schema/object-field-builder.js'
export {
	assertOutputDescriptor,
	definePluginOutputDescriptor,
	snapshotOutputValue,
} from './output/descriptor.js'
export type {
	DecimalOutputRepresentationOptions,
	EnumOutputOptions,
	GenericOutputDescriptor,
	NormalizedOutputValueOptions,
	ObjectOutputOptions,
	OutputBuilder,
	OutputDescriptor,
	OutputFields,
	OutputKind,
	OutputObjectValue,
	OutputValue,
	OutputValueOptions,
	OutputValueShape,
	TemporalOutputRepresentationOptions,
} from './output/contracts.js'
export type {
	GenericVirtualField,
	VirtualFieldBuilderMethod,
	VirtualFieldDefinition,
	VirtualFieldDependencySelection,
	VirtualFieldOptions,
	VirtualFieldResolver,
	VirtualFieldResolverItem,
} from './schema/virtual-field.js'
export { definePluginFieldFamily } from './schema/field-builder-methods.js'
export type {
	FieldBuilderMethodDefinition,
	FieldBuilderMethodContextDefinition,
	FieldBuilderMethodContexts,
	FieldBuilderMethodFactory,
	FieldBuilderMethodTypegen,
	OwnedFieldBuilderMethod,
	OwnedPluginFieldType,
	PluginFieldFamilyBuilder,
	PluginFieldFamilyContextDefinition,
	PluginFieldFamilyContexts,
	PluginFieldFamilyDefinition,
	PluginFieldFamilyRegistrar,
	PluginFieldTypegen,
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
	UltimaBaseGeneratedEmbeddedFieldBuilderMethods,
	UltimaBaseGeneratedEmbeddedFieldOptions,
	UltimaBaseGeneratedFieldBuilderMethods,
	UltimaBaseGeneratedFieldOptionCompatibility,
	UltimaBaseGeneratedFieldOptions,
	UltimaBaseGeneratedOutputBuilderMethods,
	UltimaBaseGeneratedOutputOptions,
	UltimaBaseGeneratedOperations,
	UltimaBaseGeneratedRegistryState,
	UltimaBaseGeneratedSchemaOptions,
	UltimaBaseGeneratedSchemaName,
	UltimaBaseGeneratedSchemas,
	UltimaBaseGeneratedSchemaSurfaces,
	UltimaBaseGeneratedVirtualFieldBuilderMethods,
	UltimaBaseGeneratedVirtualFieldOptions,
} from './type-info.js'
export {
	fieldDeclarationContexts,
	assertFieldDeclarationContext,
} from './schema/field-contexts.js'
export type { FieldDeclarationContext } from './schema/field-contexts.js'
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
} from './schema/model-contracts.js'
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
} from './fields/builtins/string.js'
export { timeField } from './fields/builtins/time.js'
export type { TimeField, TimeFieldOptions } from './fields/builtins/time.js'
export { uuidField } from './fields/builtins/uuid.js'
export type { UuidField, UuidFieldOptions } from './fields/builtins/uuid.js'
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
export { fieldUsesTemporalTimezone } from './plans/scalar-shape-validation.js'
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
