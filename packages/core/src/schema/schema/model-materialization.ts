import type { SchemaDefinition } from './definition.js'
import type {
	SchemaModelMaterialization,
	SchemaPreparedDraft,
	SchemaResult,
} from './model-contracts.js'
import {
	isSchemaModelClassRegistered,
	persistedModelConstructionKey,
	preparedDraftConstructionKey,
} from './model-state.js'

type RuntimeSchemaModelConstructor = new (
	input: unknown,
	constructionKey: symbol,
	materialization?: SchemaModelMaterialization,
) => object

/** Resolves only framework-created schema classes for private materialization. */
const readRuntimeSchemaModelConstructor = (
	schema: SchemaDefinition,
): RuntimeSchemaModelConstructor => {
	if (!isSchemaModelClassRegistered(schema)) {
		throw new TypeError('Schema model class was not created by Schema.define')
	}

	// Registration proves the private constructor protocol that SchemaDefinition
	// intentionally omits from its public structural contract.
	return schema as unknown as RuntimeSchemaModelConstructor
}

/** Materializes one complete pre-persistence candidate without write commands. */
export const materializePreparedSchemaDraft = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	values: unknown,
): SchemaPreparedDraft<TSchema> => {
	const Model = readRuntimeSchemaModelConstructor(schema)

	// The private construction key fixes lifecycle provenance; this assertion
	// restores only the exact schema identity already carried by the constructor.
	return new Model(
		values,
		preparedDraftConstructionKey,
	) as SchemaPreparedDraft<TSchema>
}

/** Converts one final plain Runtime record into its exact generated schema class. */
export const materializeSchemaModel = <
	const TSchema extends SchemaDefinition,
	const TValues extends object,
>(
	schema: TSchema,
	values: TValues,
	materialization?: SchemaModelMaterialization,
): SchemaResult<TSchema, TValues> => {
	const Model = readRuntimeSchemaModelConstructor(schema)

	// Runtime validated and detached TValues before the private constructor; the
	// assertion restores that exact visible projection on the trusted model class.
	return new Model(
		values,
		persistedModelConstructionKey,
		materialization,
	) as SchemaResult<TSchema, TValues>
}
