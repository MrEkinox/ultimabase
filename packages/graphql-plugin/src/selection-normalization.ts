import { getFieldSchemaTarget, type SchemaDefinition } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { collectFields as collectGraphqlFields } from '@graphql-tools/utils'
import {
	getArgumentValues,
	getNamedType,
	isObjectType,
	Kind,
	type FieldNode,
	type FragmentDefinitionNode,
	type GraphQLField,
	type GraphQLObjectType,
	type GraphQLResolveInfo,
	type SelectionSetNode,
} from 'graphql'

import type { GraphqlConnectionRuntime } from './connection-runtime.js'

interface CollectedField {
	readonly name: string
	readonly nodes: readonly FieldNode[]
	readonly responseName: string
}

interface SelectionContext {
	readonly fragments: Readonly<Record<string, FragmentDefinitionNode>>
	readonly info: GraphQLResolveInfo
}

export interface GraphqlReadProjection {
	readonly include?: Readonly<Record<string, unknown>>
	readonly select: Readonly<Record<string, true>>
}

/** Identifies the declared relationship a nested cursor belongs to. */
export interface GraphqlConnectionScope {
	readonly relationPath: readonly string[]
	readonly typeName: string
}

/** Converts collection arguments into existing Core query clauses. */
export const normalizeGraphqlCollectionArguments = (
	schema: SchemaDefinition,
	args: Readonly<Record<string, unknown>>,
	connections: GraphqlConnectionRuntime,
	scope: GraphqlConnectionScope,
): Readonly<Record<string, unknown>> =>
	connections.prepare({
		arguments: args,
		relationPath: scope.relationPath,
		schema,
		typeName: scope.typeName,
	}).clauses

export type GraphqlRelationshipSelectionMode = 'include' | 'stored-pointer-only'

const collectFields = (
	selectionSets: readonly SelectionSetNode[],
	context: SelectionContext,
	type: GraphQLObjectType,
): readonly CollectedField[] => {
	// Request validation rejects unknown/cyclic fragments and contradictory
	// response fields before this standard collector sees resolver selections.
	const { fields } = collectGraphqlFields<Readonly<Record<string, unknown>>>(
		context.info.schema,
		context.fragments,
		context.info.variableValues,
		type,
		{
			kind: Kind.SELECTION_SET,
			selections: selectionSets.flatMap((set) => set.selections),
		},
	)
	return [...fields].map(([responseName, nodes]) => ({
		name: nodes[0]?.name.value ?? responseName,
		nodes,
		responseName,
	}))
}

const childSelectionSets = (
	field: CollectedField,
): readonly SelectionSetNode[] =>
	field.nodes.flatMap((node) =>
		node.selectionSet === undefined ? [] : [node.selectionSet],
	)

const fieldArguments = (
	field: CollectedField,
	definition: GraphQLField<unknown, unknown>,
	context: SelectionContext,
): Readonly<Record<string, unknown>> => {
	const node = field.nodes[0]
	if (node === undefined) return {}
	return immutableRecord(
		getArgumentValues(definition, node, context.info.variableValues),
	)
}

const relationNodeSelectionSets = (
	field: CollectedField,
	connectionType: GraphQLObjectType,
	context: SelectionContext,
): readonly SelectionSetNode[] => {
	const selected = collectFields(
		childSelectionSets(field),
		context,
		connectionType,
	)
	const result: SelectionSetNode[] = []
	for (const connectionField of selected) {
		if (connectionField.name === 'nodes') {
			result.push(...childSelectionSets(connectionField))
			continue
		}
		if (connectionField.name !== 'edges') continue
		const edgeDefinition = connectionType.getFields().edges
		const edgeType = edgeDefinition && getNamedType(edgeDefinition.type)
		if (!edgeType || !isObjectType(edgeType)) {
			throw new TypeError('GraphQL connection edge type is malformed')
		}
		for (const edgeField of collectFields(
			childSelectionSets(connectionField),
			context,
			edgeType,
		)) {
			if (edgeField.name === 'node') {
				result.push(...childSelectionSets(edgeField))
			}
		}
	}
	return result
}

const modelProjection = (
	schema: SchemaDefinition,
	type: GraphQLObjectType,
	selectionSets: readonly SelectionSetNode[],
	context: SelectionContext,
	connections: GraphqlConnectionRuntime,
	relationshipMode: GraphqlRelationshipSelectionMode,
): GraphqlReadProjection => {
	const select: Record<string, true> = {}
	const include: Record<string, unknown> = {}
	const relationshipResponseNames = new Map<string, string>()
	for (const selected of collectFields(selectionSets, context, type)) {
		if (selected.name === '__typename') continue
		const field = schema.fields[selected.name]
		const definition = type.getFields()[selected.name]
		if (field === undefined || definition === undefined) {
			throw new TypeError(
				`Unknown GraphQL selection ${schema.className}.${selected.name}`,
			)
		}
		if (field.kind !== 'pointer' && field.kind !== 'relation') {
			select[selected.name] = true
			continue
		}
		if (relationshipMode === 'stored-pointer-only') {
			if (field.kind === 'relation') {
				throw new TypeError(
					`GraphQL ${schema.className}.${selected.name} cannot be selected from delete or upsert results`,
				)
			}
			const pointerType = getNamedType(definition.type)
			if (!isObjectType(pointerType)) {
				throw new TypeError(
					`GraphQL relationship ${schema.className}.${selected.name} is malformed`,
				)
			}
			const pointerFields = collectFields(
				childSelectionSets(selected),
				context,
				pointerType,
			)
			if (
				pointerFields.some(
					(pointerField) =>
						pointerField.name !== 'id' && pointerField.name !== '__typename',
				)
			) {
				throw new TypeError(
					`GraphQL ${schema.className}.${selected.name} can expose only pointer id from delete or upsert results`,
				)
			}
			select[selected.name] = true
			continue
		}
		const previousResponseName = relationshipResponseNames.get(selected.name)
		if (
			previousResponseName !== undefined &&
			previousResponseName !== selected.responseName
		) {
			throw new TypeError(
				`GraphQL relationship ${schema.className}.${selected.name} cannot use multiple response names`,
			)
		}
		relationshipResponseNames.set(selected.name, selected.responseName)
		const target = getFieldSchemaTarget(field)?.()
		if (target === undefined) {
			throw new TypeError(
				`Missing relationship target for ${schema.className}.${selected.name}`,
			)
		}
		const outputType = getNamedType(definition.type)
		if (!isObjectType(outputType)) {
			throw new TypeError(
				`GraphQL relationship ${schema.className}.${selected.name} is malformed`,
			)
		}
		const modelType =
			field.kind === 'relation'
				? getNamedType(outputType.getFields().nodes?.type)
				: outputType
		if (!modelType || !isObjectType(modelType)) {
			throw new TypeError('GraphQL relationship model type is malformed')
		}
		const targetSelectionSets =
			field.kind === 'relation'
				? relationNodeSelectionSets(selected, outputType, context)
				: childSelectionSets(selected)
		// A cursor identifies the declared relationship itself, independently of
		// which root or pointer traversal reached this model type.
		const targetRelationPath = [schema.className, selected.name]
		const projection = modelProjection(
			target,
			modelType,
			targetSelectionSets,
			context,
			connections,
			relationshipMode,
		)
		include[selected.name] = immutableRecord({
			...(field.kind === 'relation'
				? normalizeGraphqlCollectionArguments(
						target,
						fieldArguments(selected, definition, context),
						connections,
						{
							relationPath: targetRelationPath,
							typeName: modelType.name,
						},
					)
				: {}),
			...projection,
		})
	}
	if (Object.keys(select).length === 0) select.id = true
	return immutableRecord({
		...(Object.keys(include).length === 0
			? {}
			: { include: immutableRecord(include) }),
		select: immutableRecord(select),
	})
}

/** Converts one validated GraphQL selection into Core projection clauses. */
export const normalizeGraphqlSelection = (
	schema: SchemaDefinition,
	info: GraphQLResolveInfo,
	connectionRoot: boolean,
	connections: GraphqlConnectionRuntime,
	relationshipMode: GraphqlRelationshipSelectionMode = 'include',
): GraphqlReadProjection => {
	const context: SelectionContext = { fragments: info.fragments, info }
	const root = getNamedType(info.returnType)
	if (!isObjectType(root)) {
		throw new TypeError('GraphQL read result must be an object type')
	}
	const rootSelectionSets = info.fieldNodes.flatMap((node) =>
		node.selectionSet === undefined ? [] : [node.selectionSet],
	)
	if (!connectionRoot) {
		return modelProjection(
			schema,
			root,
			rootSelectionSets,
			context,
			connections,
			relationshipMode,
		)
	}
	const model = getNamedType(root.getFields().nodes?.type)
	if (!model || !isObjectType(model)) {
		throw new TypeError('GraphQL connection model type is malformed')
	}
	const synthetic: CollectedField = {
		name: 'connection',
		nodes: info.fieldNodes,
		responseName: 'connection',
	}
	return modelProjection(
		schema,
		model,
		relationNodeSelectionSets(synthetic, root, context),
		context,
		connections,
		relationshipMode,
	)
}
