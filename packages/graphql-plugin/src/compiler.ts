import type {
	ApplicationOperationTransportPlan,
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
} from '@ultimabase/core'
import { GraphQLObjectType, GraphQLSchema, validateSchema } from 'graphql'

import { compileGraphqlBindings } from './binding-compiler.js'
import {
	GraphqlCompileContext,
	GraphqlNameRegistry,
} from './compile-context.js'
import type { NormalizedGraphqlExecutionLimits } from './connection-limits.js'
import { GraphqlFieldTypeCompiler } from './field-compiler.js'
import { GraphqlFilterInputCompiler } from './filter-input-compiler.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import type { GraphqlSchemaOperations } from './options.js'
import type { graphqlProtocol } from './protocol.js'
import {
	compileGraphqlMutationFields,
	compileGraphqlQueryFields,
	graphqlCollectionArguments,
	type GraphqlRootCompilers,
} from './root-fields.js'
import type { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'
import { graphqlBuiltInTypeNames } from './scalar-types.js'
import { collectGraphqlSchemaSurfaces } from './surfaces.js'

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
	for (const name of [...graphqlBuiltInTypeNames, 'Mutation', 'Query']) {
		names.claimType(name, `reserved GraphQL ${name}`)
	}
	const ctx = new GraphqlCompileContext(
		names,
		options.schemas,
		collectGraphqlSchemaSurfaces(
			options.schemas,
			options.defaultOperations,
			names,
		),
	)
	const { execution } = options
	const fields: GraphqlFieldTypeCompiler = new GraphqlFieldTypeCompiler(ctx, {
		arguments: (target) =>
			graphqlCollectionArguments(roots, target, 'relation'),
		resolver: (source, fieldName, target, targetTypeName) =>
			execution.relation(source, fieldName, target, targetTypeName),
	})
	const filters = new GraphqlFilterInputCompiler(ctx, fields)
	const inputs = new GraphqlMutationInputCompiler(ctx, fields)
	const roots: GraphqlRootCompilers = {
		ctx,
		defaultTake: options.connectionLimits.defaultTake,
		execution,
		fields,
		filters,
		inputs,
	}
	// Models and application inputs come first so their type order is stable.
	for (const surface of ctx.surfaces.values()) {
		fields.model(surface.schema)
		if (surface.owner.kind === 'application') {
			inputs.createInput(surface.schema)
			inputs.updateInput(surface.schema)
		}
	}
	const addBindingRoots = compileGraphqlBindings({
		ctx,
		execution,
		fields,
		inputs,
		operationPlan: options.operationPlan,
		schemaMutationPlan: options.schemaMutationPlan,
		schemaMutations: options.schemaMutations,
	})
	const queryFields = compileGraphqlQueryFields(roots)
	const mutationFields = compileGraphqlMutationFields(roots)
	addBindingRoots(queryFields, mutationFields)
	const query = new GraphQLObjectType({ name: 'Query', fields: queryFields })
	const mutation =
		Object.keys(mutationFields).length === 0
			? undefined
			: new GraphQLObjectType({ name: 'Mutation', fields: mutationFields })
	// Force every lazy field map now so later schema construction is side-effect free.
	ctx.materialize([
		'filters',
		'structural',
		'mutationInputs',
		'rootInputs',
		'connections',
		'models',
	])
	const schema = new GraphQLSchema({
		...(mutation === undefined ? {} : { mutation }),
		query,
		types: ctx.types,
	})
	const errors = validateSchema(schema)
	// An empty query root is reported with its precise reason during composition.
	if (Object.keys(queryFields).length > 0 && errors.length > 0) {
		throw new TypeError(
			`Invalid generated GraphQL schema: ${errors[0]?.message ?? 'unknown validation failure'}`,
		)
	}
	return schema
}
