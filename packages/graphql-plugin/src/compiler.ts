import type { CompiledSchemaRegistry, SchemaDefinition } from '@ultimabase/core'
import {
	GraphQLID,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	validateSchema,
	type GraphQLFieldConfigMap,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import { GraphqlFieldTypeCompiler } from './field-compiler.js'
import { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import { assertGraphqlFieldName, GraphqlNameRegistry } from './names.js'
import type { GraphqlSchemaOperations } from './options.js'
import {
	collectGraphqlSchemaSurfaces,
	type GraphqlSchemaSurface,
} from './surfaces.js'

const reserveGraphqlNames = (names: GraphqlNameRegistry): void => {
	for (const name of [
		'BigInt',
		'Base64',
		'Boolean',
		'Date',
		'DateTime',
		'Decimal',
		'Float',
		'ID',
		'Int',
		'JSON',
		'Mutation',
		'Query',
		'SafeInt',
		'String',
		'Time',
		'UUID',
	]) {
		names.claimType(name, { description: `reserved GraphQL ${name}` })
	}
}

const compileQueryFields = (
	surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>,
	fields: GraphqlFieldTypeCompiler,
): GraphQLFieldConfigMap<unknown, unknown> => {
	const queryFields: GraphQLFieldConfigMap<unknown, unknown> = {}
	for (const surface of surfaces.values()) {
		if (!surface.get) continue
		const fieldName = `get${surface.typeName}`
		assertGraphqlFieldName(
			fieldName,
			`generated get operation for ${surface.schema.className}`,
			surface.owner,
		)
		queryFields[fieldName] = {
			args: { id: { type: new GraphQLNonNull(GraphQLID) } },
			type: fields.model(surface.schema),
		}
	}
	if (Object.keys(queryFields).length === 0) {
		throw new GraphqlSchemaCompilationError(
			'missing-query-root',
			'GraphQL schema compilation requires at least one public query field',
		)
	}
	return queryFields
}

/** Compiles one isolated GraphQL structural schema from the final Core graph. */
export const compileGraphqlSchema = (
	options: Readonly<{
		readonly defaultOperations?: boolean | GraphqlSchemaOperations
		readonly schemas: CompiledSchemaRegistry
	}>,
): GraphQLSchema => {
	const names = new GraphqlNameRegistry()
	reserveGraphqlNames(names)
	const surfaces = collectGraphqlSchemaSurfaces(
		options.schemas,
		options.defaultOperations,
		names,
	)
	const fields = new GraphqlFieldTypeCompiler({
		names,
		schemas: options.schemas,
		surfaces,
	})
	const mutations = new GraphqlMutationInputCompiler({
		fieldTypes: fields,
		names,
		surfaces,
	})
	for (const surface of surfaces.values()) {
		fields.model(surface.schema)
		if (surface.owner.kind === 'application') {
			mutations.createInput(surface.schema)
			mutations.updateInput(surface.schema)
		}
	}
	const query = new GraphQLObjectType({
		name: 'Query',
		fields: compileQueryFields(surfaces, fields),
	})
	mutations.materialize()
	fields.materialize()
	const schema = new GraphQLSchema({
		query,
		types: [...fields.types, ...mutations.types],
	})
	const errors = validateSchema(schema)
	if (errors.length > 0) {
		throw new TypeError(
			`Invalid generated GraphQL schema: ${errors[0]?.message ?? 'unknown validation failure'}`,
		)
	}
	return schema
}
