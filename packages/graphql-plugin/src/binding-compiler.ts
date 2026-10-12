import type {
	ApplicationOperationTransportPlan,
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
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
	isSameBindingOwner,
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
import { describeUnboundOperation } from './operation-json-types.js'
import type { graphqlProtocol } from './protocol.js'
import { graphqlMethodNames, readGraphqlSchemaRule } from './rules.js'
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
) => Readonly<{ commands: readonly string[] }>

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

/** Reads the class name of the one application schema the owner added or claimed. */
const ownedSchemaClassName = (
	schemas: CompiledSchemaRegistry,
	owner: PluginSchemaContributionOwner,
	path: string,
): string => {
	const owned = schemas.values().filter((schema) => {
		const schemaOwner = schema.definition.provenance.schema.owner
		return (
			schemaOwner.kind === 'plugin' && isSameBindingOwner(schemaOwner, owner)
		)
	})
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
		const commands: string[] = []
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
			commands.push(fieldName)
		}
		return immutableRecord({ commands: immutableArray(commands) })
	}
}

interface SchemaMutationBinding {
	readonly descriptor: ExposedSchemaMutationTransportBinding
	readonly metadata: GraphqlSchemaMutationBindingMetadata
	readonly owner: PluginSchemaContributionOwner
	readonly schema: SchemaDefinition
}

const nativeKeys: ReadonlySet<string> = new Set(graphqlMethodNames)

/**
 * Checks that every key of an application schema's rule names a native
 * method or one of the commands GraphQL can expose on that schema.
 */
const assertRuleKeys = (
	schema: SchemaDefinition,
	commands: ReadonlySet<string>,
): void => {
	const rule = readGraphqlSchemaRule(schema)
	if (typeof rule !== 'object') return
	for (const key of Object.keys(rule.methods)) {
		if (nativeKeys.has(key) || commands.has(key)) continue
		throw new TypeError(
			`graphql.${key} on ${schema.className} names no schema method or exposable command${commands.size === 0 ? '' : `; its commands are ${[...commands].sort().join(', ')}`}`,
		)
	}
}

const collectSchemaMutationBindings = (
	compilers: GraphqlBindingCompilers,
	types: GraphqlBindingTypes,
): readonly SchemaMutationBinding[] => {
	const { ctx } = compilers
	const exposable = new Map<string, Set<string>>()
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
		const names = exposable.get(schema.className) ?? new Set<string>()
		names.add(descriptor.command)
		exposable.set(schema.className, names)
		// Commands are exposed only through `.with({ graphql })` (ADR-0325).
		if (!surface.command(descriptor.command)) {
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
		bindings.push({ descriptor, metadata, owner, schema })
	}
	for (const surface of ctx.surfaces.values()) {
		if (surface.owner.kind !== 'application') continue
		assertRuleKeys(
			surface.schema,
			exposable.get(surface.schema.className) ?? new Set(),
		)
	}
	return bindings
}
