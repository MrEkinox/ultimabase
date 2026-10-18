import type {
	ApplicationOperationTransportPlan,
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
	ExposedSchemaMethod,
	ExposedSchemaMutationTransportBinding,
	PluginSchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import {
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLNonNull,
	type GraphQLFieldConfigMap,
} from 'graphql'

import {
	bindingOwnerFor,
	isBindingOwnerSchema,
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
import type { GraphqlWriteRoot } from './exposure.js'
import { describeUnboundOperation } from './operation-json-types.js'
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
) => Readonly<{ commands: readonly GraphqlWriteRoot[] }>

// A command its owner did not bind takes no data: its input is the row ID.
const unboundCommandMetadata: GraphqlSchemaMutationBindingMetadata =
	immutableRecord({
		kind: 'graphql-schema-mutation-binding',
		types: immutableArray([]),
	})

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

/** Reads the class name of the one schema the binding's plugin owns or designates. */
const ownedSchemaClassName = (
	schemas: CompiledSchemaRegistry,
	owner: PluginSchemaContributionOwner,
	path: string,
): string => {
	const owned = schemas
		.values()
		.filter((schema) => isBindingOwnerSchema(schema, owner))
	const [schema] = owned
	if (schema === undefined || owned.length !== 1) {
		throw new TypeError(
			`${path} requires exactly one schema owned by ${owner.pluginId}`,
		)
	}
	return schema.className
}

/** Registers operation and schema-mutation bindings, then closes their type graph. */
export const compileGraphqlBindings = (
	compilers: GraphqlBindingCompilers,
): GraphqlBindingRoots => {
	const { ctx, execution } = compilers
	const types = new GraphqlBindingTypes(ctx, compilers.fields, compilers.inputs)
	const operations = compilers.operationPlan.operations.map((descriptor) => {
		const owner = bindingOwnerFor(descriptor)
		return {
			descriptor,
			metadata: descriptor.bound
				? normalizeGraphqlOperationBindingMetadata(
						descriptor.metadata,
						descriptor.name,
						(path) => ownedSchemaClassName(ctx.schemas, owner, path),
					)
				: describeUnboundOperation(descriptor),
			owner,
		}
	})
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
		const commands: GraphqlWriteRoot[] = []
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
			const { descriptor, metadata, method, owner, schema } = binding
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
			commands.push(
				immutableRecord({
					field: fieldName,
					write: immutableRecord({ method, schema: schema.className }),
				}),
			)
		}
		return immutableRecord({ commands: immutableArray(commands) })
	}
}

interface SchemaMutationBinding {
	readonly descriptor: ExposedSchemaMutationTransportBinding
	readonly metadata: GraphqlSchemaMutationBindingMetadata
	/** The plan's entry for the command, named in the `publicWrites` check. */
	readonly method: ExposedSchemaMethod
	readonly owner: PluginSchemaContributionOwner
	readonly schema: SchemaDefinition
}

const collectSchemaMutationBindings = (
	compilers: GraphqlBindingCompilers,
	types: GraphqlBindingTypes,
): readonly SchemaMutationBinding[] => {
	const { ctx } = compilers
	const bindings: SchemaMutationBinding[] = []
	for (const descriptor of compilers.schemaMutationPlan.mutations) {
		// Master-only mutations are never generated as public fields.
		if (descriptor.authority !== 'request') continue
		const schema = ctx.schemas.get(descriptor.schema)
		const surface = schema && ctx.surfaces.get(schema)
		if (schema === undefined || surface === undefined) {
			throw new TypeError(
				`GraphQL schema mutation ${descriptor.command} targets an unavailable schema`,
			)
		}
		if (surface.owner.kind !== 'application') continue
		// Core's plan decides which commands are exposed (ADR-0347).
		const method = surface.methods.get(descriptor.command)
		if (method === undefined) {
			ctx.hints.add(
				'Mutation',
				`${descriptor.command}${surface.typeName}`,
				descriptor.command,
				schema.className,
			)
			continue
		}
		const metadata = descriptor.bound
			? normalizeGraphqlSchemaMutationBindingMetadata(
					descriptor.metadata,
					descriptor.mutation,
				)
			: unboundCommandMetadata
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
		bindings.push({ descriptor, metadata, method, owner, schema })
	}
	return bindings
}
