import type { CompiledSchemaRegistry } from '@ultimabase/core'
import { GraphQLObjectType, GraphQLSchema, validateSchema } from 'graphql'
import type { GraphQLFieldConfigArgumentMap } from 'graphql'

import { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import type { NormalizedGraphqlExecutionLimits } from './connection-limits.js'
import { GraphqlFilterInputCompiler } from './filter-input-compiler.js'
import { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import { GraphqlMutationOperationCompiler } from './mutation-operation-compiler.js'
import { GraphqlNameRegistry } from './names.js'
import type { GraphqlSchemaOperations } from './options.js'
import { GraphqlReadInputCompiler } from './read-input-compiler.js'
import { collectGraphqlSchemaSurfaces } from './surfaces.js'

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

/** Compiles one isolated GraphQL structural schema from the final Core graph. */
export const compileGraphqlSchema = (
	options: Readonly<{
		readonly connectionLimits: NormalizedGraphqlExecutionLimits
		readonly defaultOperations?: boolean | GraphqlSchemaOperations
		readonly execution: GraphqlGeneratedExecution
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
	const fields: GraphqlFieldTypeCompiler = new GraphqlFieldTypeCompiler({
		names,
		schemas: options.schemas,
		surfaces,
		relationArguments: (target): GraphQLFieldConfigArgumentMap =>
			reads.collectionArguments(target),
		relationResolver: (source, fieldName, target, targetTypeName) =>
			options.execution.relation(source, fieldName, target, targetTypeName),
	})
	const filters = new GraphqlFilterInputCompiler({
		fieldTypes: fields,
		names,
		schemas: options.schemas,
		surfaces,
	})
	const reads: GraphqlReadInputCompiler = new GraphqlReadInputCompiler({
		defaultPageSize: options.connectionLimits.defaultPageSize,
		execution: options.execution,
		fields,
		filters,
		surfaces,
	})
	const mutations = new GraphqlMutationInputCompiler({
		fieldTypes: fields,
		names,
		surfaces,
	})
	const mutationOperations = new GraphqlMutationOperationCompiler({
		execution: options.execution,
		fields,
		filters,
		inputs: mutations,
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
		fields: reads.queryFields(),
	})
	const mutation = mutationOperations.mutationType()
	reads.materialize()
	mutations.materialize()
	mutationOperations.materialize()
	fields.materialize()
	const schema = new GraphQLSchema({
		...(mutation === undefined ? {} : { mutation }),
		query,
		types: [
			...fields.types,
			...mutations.types,
			...mutationOperations.types,
			...reads.types,
		],
	})
	const errors = validateSchema(schema)
	if (errors.length > 0) {
		throw new TypeError(
			`Invalid generated GraphQL schema: ${errors[0]?.message ?? 'unknown validation failure'}`,
		)
	}
	return schema
}
