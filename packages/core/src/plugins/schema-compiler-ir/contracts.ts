import type { JsonValue } from '../../schema/fields/builtins/json.js'
import type { SchemaConstraintDefinition } from '../../schema/schema/constraints.js'
import type { FieldDeclarationContext } from '../../schema/schema/field-contexts.js'
import type { SchemaIndexDefinition } from '../../schema/schema/indexes.js'
import type {
	PluginSchemaContributionOwner,
	SchemaCompilationProvenance,
	SchemaContributionProvenance,
	SchemaOptionProvenance,
} from '../../schema/schema/provenance.js'
import type { SchemaSelectorOptions } from '../schema-patch-contracts.js'

/** Versions the complete callback-free logical schema compiler protocol. */
export const schemaCompilerProtocolVersion = '7.0.0' as const

/** Names every private artifact that may cross the compiler IR as an inert reference. */
export type SchemaCompilerArtifactKind =
	| 'constraint'
	| 'field'
	| 'option-definition'
	| 'option-value'
	| 'output'
	| 'schema'
	| 'virtual-field'

declare const schemaCompilerArtifactType: unique symbol

/**
 * Identifies one validated artifact without exposing its class, callbacks, or
 * private Core capabilities. References belong to exactly one compilation.
 */
export interface SchemaCompilerArtifactReference<
	TKind extends SchemaCompilerArtifactKind = SchemaCompilerArtifactKind,
> {
	readonly [schemaCompilerArtifactType]: TKind
	readonly artifactId: string
	readonly artifactKind: TKind
	readonly kind: 'schema-compiler-artifact'
}

/** Carries a portable value directly or preserves one opaque declared value. */
export type SchemaCompilerOptionValue =
	JsonValue | SchemaCompilerArtifactReference<'option-value'>

/** Associates one field artifact with its logical name and exact provenance. */
export interface SchemaCompilerFieldNode {
	readonly artifact: SchemaCompilerArtifactReference<'field'>
	readonly fields: readonly SchemaCompilerFieldNode[]
	readonly kind: string
	readonly name: string
	readonly options: readonly SchemaCompilerOptionNode[]
	readonly provenance: SchemaContributionProvenance
}

/** Describes one callback-free output value and its recursive object shape. */
export interface SchemaCompilerOutputNode {
	readonly artifact: SchemaCompilerArtifactReference<'output'>
	readonly fields: readonly Readonly<{
		readonly name: string
		readonly output: SchemaCompilerOutputNode
	}>[]
	readonly kind: string
	readonly options: readonly Readonly<{
		readonly name: string
		readonly value: SchemaCompilerOptionValue
	}>[]
}

/** Retains one logical virtual field while its resolver stays artifact-private. */
export interface SchemaCompilerVirtualFieldNode {
	readonly artifact: SchemaCompilerArtifactReference<'virtual-field'>
	readonly name: string
	readonly options: readonly SchemaCompilerOptionNode[]
	readonly output: SchemaCompilerOutputNode
	readonly provenance: SchemaContributionProvenance
	readonly select: readonly string[]
}

/** Records one direct option without exposing an executable normalizer. */
export interface SchemaCompilerOptionNode {
	readonly name: string
	readonly provenance: SchemaOptionProvenance
	readonly value: SchemaCompilerOptionValue
}

/** Records one normalized composite index and its contribution source. */
export interface SchemaCompilerIndexNode {
	readonly definition: SchemaIndexDefinition
	readonly provenance: SchemaContributionProvenance
}

/** Preserves one nominal portable constraint and its inspectable facts. */
export interface SchemaCompilerConstraintNode {
	readonly artifact: SchemaCompilerArtifactReference<'constraint'>
	readonly definition: SchemaConstraintDefinition
	readonly provenance: SchemaContributionProvenance
}

/**
 * Describes one complete logical schema using only portable facts and opaque
 * references to artifacts validated before compilation.
 */
export interface SchemaCompilerSchemaNode {
	readonly artifact: SchemaCompilerArtifactReference<'schema'>
	readonly className: string
	readonly constraints: readonly SchemaCompilerConstraintNode[]
	readonly developerFieldNames: readonly string[]
	readonly fields: readonly SchemaCompilerFieldNode[]
	readonly indexes: readonly SchemaCompilerIndexNode[]
	readonly options: readonly SchemaCompilerOptionNode[]
	readonly provenance: SchemaCompilationProvenance
	readonly virtualFields: readonly SchemaCompilerVirtualFieldNode[]
}

export interface SchemaCompilerAddFieldOperation {
	readonly contributionId: string
	readonly field: SchemaCompilerFieldNode
	readonly kind: 'field:add'
	readonly name: string
}

export interface SchemaCompilerAddIndexOperation {
	readonly contributionId: string
	readonly index: SchemaIndexDefinition
	readonly kind: 'index:add'
}

export interface SchemaCompilerAddConstraintOperation {
	readonly constraint: SchemaCompilerConstraintNode
	readonly contributionId: string
	readonly kind: 'constraint:add'
}

export interface SchemaCompilerSetSchemaOptionOperation {
	readonly contributionId: string
	readonly kind: 'schema-option:set'
	readonly name: string
	readonly value: SchemaCompilerOptionValue
}

export interface SchemaCompilerSetFieldOptionOperation {
	readonly contributionId: string
	readonly field: string
	readonly kind: 'field-option:set'
	readonly name: string
	readonly value: SchemaCompilerOptionValue
}

/** Lists every immutable patch operation understood by the compiler protocol. */
export type SchemaCompilerPatchOperation =
	| SchemaCompilerAddConstraintOperation
	| SchemaCompilerAddFieldOperation
	| SchemaCompilerAddIndexOperation
	| SchemaCompilerSetFieldOptionOperation
	| SchemaCompilerSetSchemaOptionOperation

/** Describes one normalized option protocol without exposing its callbacks. */
export interface SchemaCompilerOptionDefinitionNode {
	readonly artifact: SchemaCompilerArtifactReference<'option-definition'>
	readonly contributionId: string
	/** Lists supported field locations; absent for schema-scoped options. */
	readonly contexts?: readonly FieldDeclarationContext[]
	readonly name: string
	readonly owner: PluginSchemaContributionOwner
	readonly protocolVersion: number
	readonly runtimeRequirement?: Readonly<{
		readonly capabilityId: string
		readonly optional: boolean
		readonly version: string
	}>
	readonly scope: 'field' | 'schema'
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly typegen:
		| false
		| Readonly<{
				readonly generic?: 'self'
				readonly module: string
				readonly type: string
		  }>
}

/** Preserves one plugin schema addition and all facts used to attribute it. */
export interface SchemaCompilerSchemaAdditionNode {
	readonly contributionId: string
	readonly schema: SchemaCompilerSchemaNode
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Records one selector use and the patch operations applied to its frozen result. */
export interface SchemaCompilerPatchNode {
	readonly operations: readonly SchemaCompilerPatchOperation[]
	readonly owner: PluginSchemaContributionOwner
	readonly selectionId: string
	readonly selector: SchemaSelectorOptions
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Identifies one selector that must freeze before its owner's schema changes. */
export interface SchemaCompilerSelectionNode {
	readonly selectionId: string
	readonly selector: SchemaSelectorOptions
}

/** Returns the exact schema names selected at one deterministic graph position. */
export interface SchemaCompilerSelectionResultNode {
	readonly classNames: readonly string[]
	readonly selectionId: string
}

/** Groups one plugin's declarations at its exact deterministic graph position. */
export interface SchemaCompilerPluginDeclarationNode {
	readonly additions: readonly SchemaCompilerSchemaAdditionNode[]
	readonly optionDefinitions: readonly SchemaCompilerOptionDefinitionNode[]
	readonly order: number
	readonly owner: PluginSchemaContributionOwner
	readonly patches: readonly SchemaCompilerPatchNode[]
	readonly selections: readonly SchemaCompilerSelectionNode[]
}

/**
 * Supplies one complete callback-free compilation request.
 *
 * @example `const compile = (input: SchemaCompilerInput): SchemaCompilerOutput => Object.freeze({ protocolVersion: input.protocolVersion, schemas: Object.freeze([...input.schemas, ...input.declarations.flatMap(({ additions }) => additions.map(({ schema }) => schema))]), selections: Object.freeze([]) })`
 */
export interface SchemaCompilerInput {
	readonly declarations: readonly SchemaCompilerPluginDeclarationNode[]
	readonly protocolVersion: typeof schemaCompilerProtocolVersion
	readonly schemas: readonly SchemaCompilerSchemaNode[]
}

/** Returns the complete logical graph selected by one compatible compiler. */
export interface SchemaCompilerOutput {
	readonly protocolVersion: typeof schemaCompilerProtocolVersion
	readonly selections: readonly SchemaCompilerSelectionResultNode[]
	readonly schemas: readonly SchemaCompilerSchemaNode[]
}
