import type {
	ApplicationOperationTransportPlan,
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
} from '@ultimabase/core'
import {
	GraphQLEnumType,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	validateSchema,
} from 'graphql'

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
import type { GraphqlDisabledFieldHints } from './hints.js'
import type { graphqlProtocol } from './protocol.js'
import {
	compileGraphqlMutationFields,
	compileGraphqlQueryFields,
	graphqlCollectionArguments,
	type GraphqlRootCompilers,
} from './root-fields.js'
import type { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'
import type { NormalizedGraphqlRule } from './rules.js'
import { graphqlBuiltInTypeNames } from './scalar-types.js'
import { collectGraphqlSchemaSurfaces } from './surfaces.js'

/** The generated schema and the facts startup checks read from it. */
export interface GraphqlCompiledSchema {
	readonly schema: GraphQLSchema
	/** Names how to enable each field a disabled feature leaves out. */
	readonly hints: GraphqlDisabledFieldHints
	/** Whether any schema root or operation is exposed besides `health`. */
	readonly exposed: boolean
	/** Root fields that write: generated mutations and plugin commands. */
	readonly writes: readonly string[]
}

const healthStatus = new GraphQLEnumType({
	name: 'HealthStatus',
	description: 'The application health, as `ultimabase.health()`.',
	values: { DEGRADED: { value: 'DEGRADED' }, OK: { value: 'OK' } },
})

/** Compiles one isolated GraphQL structural schema from the final Core graph. */
export const compileGraphqlSchema = (
	options: Readonly<{
		readonly connectionLimits: NormalizedGraphqlExecutionLimits
		readonly defaultRule: NormalizedGraphqlRule | undefined
		readonly execution: GraphqlGeneratedExecution
		readonly operationPlan: ApplicationOperationTransportPlan
		readonly schemaMutationPlan: ApplicationSchemaMutationTransportPlan<
			typeof graphqlProtocol
		>
		readonly schemaMutations: GraphqlSchemaMutationExecution
		readonly schemas: CompiledSchemaRegistry
	}>,
): GraphqlCompiledSchema => {
	const names = new GraphqlNameRegistry()
	for (const name of [
		...graphqlBuiltInTypeNames,
		healthStatus.name,
		'Mutation',
		'Query',
	]) {
		names.claimType(name, `reserved GraphQL ${name}`)
	}
	const ctx = new GraphqlCompileContext(
		names,
		options.schemas,
		collectGraphqlSchemaSurfaces(options.schemas, options.defaultRule, names),
	)
	const { execution } = options
	const fields: GraphqlFieldTypeCompiler = new GraphqlFieldTypeCompiler(ctx, {
		arguments: (target) => graphqlCollectionArguments(roots, target),
		resolver: (source, fieldName, target, targetTypeName) =>
			execution.relation(source, fieldName, target, targetTypeName),
		totalCount: execution.totalCount(),
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
	const generatedQuery = compileGraphqlQueryFields(roots)
	const mutationFields = compileGraphqlMutationFields(roots)
	const generatedWrites = Object.keys(mutationFields)
	const bindings = addBindingRoots(generatedQuery, mutationFields)
	// `health` is always present, so an application without exposed schema
	// still starts (ADR-0325).
	const queryFields = {
		health: {
			description: 'Answers OK or DEGRADED, as `ultimabase.health()`.',
			resolve: execution.health(),
			type: new GraphQLNonNull(healthStatus),
		},
		...generatedQuery,
	}
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
		types: [healthStatus, ...ctx.types],
	})
	const errors = validateSchema(schema)
	if (errors.length > 0) {
		throw new TypeError(
			`Invalid generated GraphQL schema: ${errors[0]?.message ?? 'unknown validation failure'}`,
		)
	}
	return {
		exposed:
			Object.keys(generatedQuery).length > 0 ||
			Object.keys(mutationFields).length > 0,
		hints: ctx.hints.hints,
		schema,
		writes: [...generatedWrites, ...bindings.commands],
	}
}
