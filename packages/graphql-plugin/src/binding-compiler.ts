import type {
	ApplicationOperationTransportPlan,
	ApplicationSchemaMutationTransportPlan,
	ExposedSchemaMutationTransportBinding,
	PluginSchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import {
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLNonNull,
	type GraphQLFieldConfigMap,
} from 'graphql'

import {
	bindingOwnerFor,
	normalizeGraphqlOperationBindingMetadata,
	normalizeGraphqlSchemaMutationBindingMetadata,
	type GraphqlSchemaMutationBindingMetadata,
} from './binding-metadata.js'
import { GraphqlBindingTypes } from './binding-types.js'
import {
	assertGraphqlFieldName,
	graphqlFieldTypeSegment,
	type GraphqlCompileContext,
} from './compile-context.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import type { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import type { graphqlProtocol } from './protocol.js'
import type { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'

type RootFields = GraphQLFieldConfigMap<unknown, unknown>

/** Supplies the plans and compilers that plugin binding roots depend on. */
export interface GraphqlBindingCompilers {
	readonly ctx: GraphqlCompileContext
	readonly execution: GraphqlGeneratedExecution
	readonly fields: GraphqlFieldTypeCompiler
	readonly inputs: GraphqlMutationInputCompiler
	readonly operationPlan: ApplicationOperationTransportPlan
	readonly schemaMutationPlan: ApplicationSchemaMutationTransportPlan<
		typeof graphqlProtocol
	>
	readonly schemaMutations: GraphqlSchemaMutationExecution
}

/** Adds compiled binding roots once every generated root exists. */
export type GraphqlBindingRoots = (
	query: RootFields,
	mutation: RootFields,
) => void

const assertFreeRoot = (
	fields: RootFields,
	name: string,
	source: string,
	owner: PluginSchemaContributionOwner,
): void => {
	if (Object.hasOwn(fields, name)) {
		throw new GraphqlSchemaCompilationError(
			'name-collision',
			`GraphQL root field "${name}" from ${source} collides with an existing field`,
			{ owner, path: name },
		)
	}
}

/** Registers operation and schema-mutation bindings, then closes their type graph. */
export const compileGraphqlBindings = (
	compilers: GraphqlBindingCompilers,
): GraphqlBindingRoots => {
	const { ctx, execution } = compilers
	const types = new GraphqlBindingTypes(ctx, compilers.fields, compilers.inputs)
	const operations = compilers.operationPlan.operations.map((descriptor) => ({
		descriptor,
		metadata: normalizeGraphqlOperationBindingMetadata(
			descriptor.metadata,
			descriptor.name,
		),
		owner: bindingOwnerFor(descriptor),
	}))
	for (const { descriptor, metadata, owner } of operations) {
		types.register(metadata.types, `operation ${descriptor.name}`, owner, [
			...(metadata.input === undefined
				? []
				: [{ mode: 'input' as const, reference: metadata.input }]),
			{ mode: 'output', reference: metadata.result },
		])
	}
	const schemaMutations = collectSchemaMutationBindings(compilers, types)
	types.finalize()
	return (query, mutation) => {
		for (const { descriptor, metadata, owner } of operations) {
			const fields = metadata.root === 'query' ? query : mutation
			const source = `operation ${descriptor.name}`
			assertGraphqlFieldName(metadata.field, source, owner)
			assertFreeRoot(fields, metadata.field, source, owner)
			const { input } = metadata
			fields[metadata.field] = {
				...(input === undefined
					? {}
					: { args: { input: { type: types.inputType(input) } } }),
				resolve: (_source, args: unknown, contextValue) =>
					execution.operation(
						descriptor,
						input === undefined
							? null
							: isPlainRecord(args)
								? types.decodeInput(input, args.input)
								: undefined,
						contextValue,
					),
				type: types.outputType(metadata.result),
			}
		}
		for (const binding of schemaMutations) {
			const { descriptor, metadata, owner, schema } = binding
			const typeName = ctx.surface(schema).typeName
			const fieldName = `${descriptor.command}${typeName}`
			const source = `schema mutation ${descriptor.mutation}`
			const description = `${source} for ${schema.className}`
			assertGraphqlFieldName(fieldName, description, owner)
			assertFreeRoot(mutation, fieldName, source, owner)
			const inputName = `${graphqlFieldTypeSegment(descriptor.command)}${typeName}Input`
			ctx.names.claimType(inputName, description, owner)
			// The ID always targets one existing record; Core owns the payload contract.
			const input = new GraphQLInputObjectType({
				name: inputName,
				fields: {
					...(metadata.input === undefined
						? {}
						: { data: { type: types.inputType(metadata.input) } }),
					id: { type: new GraphQLNonNull(GraphQLID) },
				},
			})
			mutation[fieldName] = {
				args: { input: { type: new GraphQLNonNull(input) } },
				resolve: execution.schemaMutation(
					descriptor,
					schema,
					metadata.input !== undefined,
				),
				// Schema-mutation targets may become invisible after persistence, so the
				// v1 root remains nullable like update and delete.
				type: compilers.fields.model(schema),
			}
		}
	}
}

interface SchemaMutationBinding {
	readonly descriptor: ExposedSchemaMutationTransportBinding
	readonly metadata: GraphqlSchemaMutationBindingMetadata
	readonly owner: PluginSchemaContributionOwner
	readonly schema: SchemaDefinition
}

const collectSchemaMutationBindings = (
	compilers: GraphqlBindingCompilers,
	types: GraphqlBindingTypes,
): readonly SchemaMutationBinding[] => {
	const bindings: SchemaMutationBinding[] = []
	for (const descriptor of compilers.schemaMutationPlan.mutations) {
		if (descriptor.authority !== 'request') continue
		const schema = compilers.ctx.schemas.get(descriptor.schema)
		const surface = schema && compilers.ctx.surfaces.get(schema)
		if (schema === undefined || surface === undefined) {
			throw new TypeError(
				`GraphQL schema mutation ${descriptor.command} targets an unavailable schema`,
			)
		}
		if (surface.owner.kind !== 'application' || !surface.schemaMutations) {
			continue
		}
		const metadata = normalizeGraphqlSchemaMutationBindingMetadata(
			descriptor.metadata,
			descriptor.mutation,
		)
		const owner = bindingOwnerFor(descriptor)
		types.register(
			metadata.types,
			`schema mutation ${descriptor.mutation}`,
			owner,
			metadata.input === undefined
				? []
				: [{ mode: 'input', reference: metadata.input }],
		)
		compilers.schemaMutations.select(descriptor)
		bindings.push({ descriptor, metadata, owner, schema })
	}
	return bindings
}
