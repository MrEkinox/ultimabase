import type {
	ApplicationOperationTransportPlan,
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
} from '@ultimabase/core'
import { GraphQLObjectType, GraphQLSchema, validateSchema } from 'graphql'
import type { GraphQLFieldConfigArgumentMap } from 'graphql'

import { GraphqlBindingTypeCompiler } from './binding-type-compiler.js'
import { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import type { NormalizedGraphqlExecutionLimits } from './connection-limits.js'
import { GraphqlFilterInputCompiler } from './filter-input-compiler.js'
import { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import { GraphqlMutationOperationCompiler } from './mutation-operation-compiler.js'
import { GraphqlNameRegistry } from './names.js'
import { GraphqlOperationSchemaCompiler } from './operation-schema-compiler.js'
import type { GraphqlSchemaOperations } from './options.js'
import { GraphqlReadInputCompiler } from './read-input-compiler.js'
import type { graphqlProtocol } from './protocol.js'
import type { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'
import { GraphqlSchemaMutationSchemaCompiler } from './schema-mutation-schema-compiler.js'
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
		readonly operationPlan: ApplicationOperationTransportPlan
		readonly schemaMutationPlan: ApplicationSchemaMutationTransportPlan<
			typeof graphqlProtocol
		>
		readonly schemaMutations: GraphqlSchemaMutationExecution
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
		schemas: options.schemas,
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
	const bindingTypes = new GraphqlBindingTypeCompiler({
		fields,
		names,
		schemas: [...surfaces.keys()],
	})
	const operationCompiler = new GraphqlOperationSchemaCompiler({
		execution: options.execution,
		plan: options.operationPlan,
		types: bindingTypes,
	})
	const schemaMutationCompiler = new GraphqlSchemaMutationSchemaCompiler({
		execution: options.execution,
		fieldTypes: fields,
		names,
		plan: options.schemaMutationPlan,
		schemaMutations: options.schemaMutations,
		surfaces,
		types: bindingTypes,
	})
	bindingTypes.finalize()
	const queryFields = reads.queryFields()
	const mutationFields = mutationOperations.mutationFields()
	operationCompiler.addRootFields(queryFields, mutationFields)
	schemaMutationCompiler.addRootFields(mutationFields)
	const query = new GraphQLObjectType({
		name: 'Query',
		fields: queryFields,
	})
	const mutation =
		Object.keys(mutationFields).length === 0
			? undefined
			: new GraphQLObjectType({ name: 'Mutation', fields: mutationFields })
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
			...bindingTypes.types,
			...reads.types,
		],
	})
	const errors = validateSchema(schema)
	const hasQuery = Object.keys(queryFields).length > 0
	if (hasQuery && errors.length > 0) {
		throw new TypeError(
			`Invalid generated GraphQL schema: ${errors[0]?.message ?? 'unknown validation failure'}`,
		)
	}
	return schema
}
