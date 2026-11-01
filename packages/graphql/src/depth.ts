// The depth limits (D-107): a document nested deeper than `maxDepth` is
// refused before it runs. A field of a connection or an edge is no level
// (D-185). `__schema` and `__type` do not count, since the standard
// introspection query is about 12 levels deep; they have their own limit,
// graphql-js's, measured here once per fragment.
import type {
	ASTVisitor,
	FieldNode,
	GraphQLNamedType,
	SelectionNode,
	SelectionSetNode,
	ValidationContext,
	ValidationRule,
} from 'graphql'
import { getNamedType, GraphQLError, isObjectType, Kind } from 'graphql'

const introspection = new Set(['__schema', '__type'])

type Parent = GraphQLNamedType | null | undefined
/** A field's depth in its parent type, given the depth of what it selects. */
type Weigh = (field: FieldNode, parent: Parent, below: () => number) => number

/** The type a field of `parent` returns, unwrapped. */
function childOf(parent: Parent, field: FieldNode): Parent {
	if (!isObjectType(parent)) return undefined
	const found = parent.getFields()[field.name.value]
	return found === undefined ? undefined : getNamedType(found.type)
}

/** The deepest path under a selection set, each fragment measured once. */
function measurer(
	context: ValidationContext,
	weigh: Weigh,
): (set: SelectionSetNode | undefined, parent: Parent) => number {
	const schema = context.getSchema()
	const typed = (name: string | undefined, parent: Parent): Parent =>
		name === undefined ? parent : schema.getType(name)
	// One being measured counts 0, which only a cycle meets, and
	// `NoFragmentCyclesRule` refuses a cycle.
	const fragments = new Map<string, number>()
	const depth = (set: SelectionSetNode | undefined, parent: Parent): number => {
		let deepest = 0
		for (const selection of set?.selections ?? []) {
			deepest = Math.max(deepest, depthOf(selection, parent))
		}
		return deepest
	}
	const depthOf = (selection: SelectionNode, parent: Parent): number => {
		if (selection.kind === Kind.FIELD) {
			const child = childOf(parent, selection)
			return weigh(selection, parent, () =>
				depth(selection.selectionSet, child),
			)
		}
		if (selection.kind === Kind.INLINE_FRAGMENT) {
			const type = typed(selection.typeCondition?.name.value, parent)
			return depth(selection.selectionSet, type)
		}
		const name = selection.name.value
		const known = fragments.get(name)
		if (known !== undefined) return known
		fragments.set(name, 0)
		const fragment = context.getFragment(name)
		const type = typed(fragment?.typeCondition.name.value, undefined)
		const measured = depth(fragment?.selectionSet, type)
		fragments.set(name, measured)
		return measured
	}
	return depth
}

/**
 * The validation rule that refuses a document deeper than `maxDepth`, the
 * fields of the `wrappers` types, connections and edges, counting none.
 */
export function depthRule(
	maxDepth: number,
	wrappers: ReadonlySet<string>,
): ValidationRule {
	return (context: ValidationContext): ASTVisitor => {
		const depth = measurer(context, (field, parent, below) => {
			if (introspection.has(field.name.value)) return 0
			const level = wrappers.has(parent?.name ?? '') ? 0 : 1
			return level + below()
		})
		return {
			OperationDefinition: (node) => {
				const root = context.getSchema().getRootType(node.operation)
				const measured = depth(node.selectionSet, root)
				if (measured <= maxDepth) return
				context.reportError(
					new GraphQLError(
						`The document is nested ${measured} levels deep; the most is ${maxDepth}.`,
						{ nodes: node },
					),
				)
			},
		}
	}
}

// The lists graphql-js's `MaxIntrospectionDepthRule` counts, and how many
// nested ones it refuses. Its own walk visits a fragment once per path, so a
// fragment spreading the previous one twice costs 2^n visits.
const lists = new Set(['fields', 'interfaces', 'possibleTypes', 'inputFields'])
const maxLists = 3

/** `MaxIntrospectionDepthRule`, measuring each fragment once. */
export const introspectionDepthRule: ValidationRule = (context) => {
	const depth = measurer(
		context,
		(field, _, below) => (lists.has(field.name.value) ? 1 : 0) + below(),
	)
	return {
		Field: (node) => {
			if (!introspection.has(node.name.value)) return undefined
			if (depth(node.selectionSet, undefined) < maxLists) return undefined
			context.reportError(
				new GraphQLError('Maximum introspection depth exceeded', {
					nodes: [node],
				}),
			)
			return false
		},
	}
}
