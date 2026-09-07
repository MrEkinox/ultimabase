import { getFieldSchemaTarget, type SchemaDefinition } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import {
	getArgumentValues,
	getDirectiveValues,
	getNamedType,
	GraphQLIncludeDirective,
	GraphQLSkipDirective,
	isObjectType,
	Kind,
	type FieldNode,
	type FragmentDefinitionNode,
	type GraphQLField,
	type GraphQLObjectType,
	type GraphQLResolveInfo,
	type SelectionNode,
	type SelectionSetNode,
} from 'graphql'

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

export type GraphqlRelationArgumentNormalizer = (
	schema: SchemaDefinition,
	args: Readonly<Record<string, unknown>>,
	scope: Readonly<{
		readonly relationPath: readonly string[]
		readonly typeName: string
	}>,
) => Readonly<Record<string, unknown>>

export type GraphqlRelationshipSelectionMode = 'include' | 'stored-pointer-only'

const shouldInclude = (
	node: SelectionNode | FragmentDefinitionNode,
	info: GraphQLResolveInfo,
): boolean => {
	const skipped = getDirectiveValues(
		GraphQLSkipDirective,
		node,
		info.variableValues,
	)
	if (skipped?.if === true) return false
	const included = getDirectiveValues(
		GraphQLIncludeDirective,
		node,
		info.variableValues,
	)
	return included?.if !== false
}

const collectSelection = (
	selections: readonly SelectionNode[],
	context: SelectionContext,
	fields: Map<string, CollectedField>,
	fragmentStack: Set<string>,
): void => {
	for (const selection of selections) {
		if (!shouldInclude(selection, context.info)) continue
		if (selection.kind === Kind.FIELD) {
			const responseName = selection.alias?.value ?? selection.name.value
			const existing = fields.get(responseName)
			if (existing !== undefined && existing.name !== selection.name.value) {
				throw new TypeError(
					`GraphQL response field ${responseName} has contradictory selections`,
				)
			}
			fields.set(responseName, {
				name: selection.name.value,
				nodes: [...(existing?.nodes ?? []), selection],
				responseName,
			})
			continue
		}
		if (selection.kind === Kind.INLINE_FRAGMENT) {
			collectSelection(
				selection.selectionSet.selections,
				context,
				fields,
				fragmentStack,
			)
			continue
		}
		const name = selection.name.value
		if (fragmentStack.has(name)) {
			throw new TypeError(`GraphQL fragment cycle detected at ${name}`)
		}
		const fragment = context.fragments[name]
		if (fragment === undefined) {
			throw new TypeError(`Unknown GraphQL fragment ${name}`)
		}
		if (!shouldInclude(fragment, context.info)) continue
		fragmentStack.add(name)
		collectSelection(
			fragment.selectionSet.selections,
			context,
			fields,
			fragmentStack,
		)
		fragmentStack.delete(name)
	}
}

const collectFields = (
	selectionSets: readonly SelectionSetNode[],
	context: SelectionContext,
): readonly CollectedField[] => {
	const fields = new Map<string, CollectedField>()
	for (const selectionSet of selectionSets) {
		collectSelection(selectionSet.selections, context, fields, new Set())
	}
	return [...fields.values()]
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
	const selected = collectFields(childSelectionSets(field), context)
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
	normalizeRelationArguments: GraphqlRelationArgumentNormalizer,
	relationshipMode: GraphqlRelationshipSelectionMode,
): GraphqlReadProjection => {
	const select: Record<string, true> = {}
	const include: Record<string, unknown> = {}
	const relationshipResponseNames = new Map<string, string>()
	for (const selected of collectFields(selectionSets, context)) {
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
			const pointerFields = collectFields(childSelectionSets(selected), context)
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
			normalizeRelationArguments,
			relationshipMode,
		)
		include[selected.name] = immutableRecord({
			...(field.kind === 'relation'
				? normalizeRelationArguments(
						target,
						fieldArguments(selected, definition, context),
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
	normalizeRelationArguments: GraphqlRelationArgumentNormalizer,
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
			normalizeRelationArguments,
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
		normalizeRelationArguments,
		relationshipMode,
	)
}
