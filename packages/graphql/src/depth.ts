// The depth limit (D-107): a document nested deeper than `maxDepth` is
// refused before it runs. `__schema` and `__type` do not count, since the
// standard introspection query is about 12 levels deep.
import type {
	ASTVisitor,
	SelectionNode,
	SelectionSetNode,
	ValidationContext,
	ValidationRule,
} from 'graphql'
import { GraphQLError, Kind } from 'graphql'

const introspection = new Set(['__schema', '__type'])

/** The validation rule that refuses a document deeper than `maxDepth`. */
export function depthRule(maxDepth: number): ValidationRule {
	return (context: ValidationContext): ASTVisitor => {
		// Each fragment is measured once. One being measured counts 0, which
		// only a cycle meets, and `NoFragmentCyclesRule` refuses a cycle.
		const fragments = new Map<string, number>()
		const depth = (set: SelectionSetNode | undefined): number => {
			let deepest = 0
			for (const selection of set?.selections ?? []) {
				deepest = Math.max(deepest, depthOf(selection))
			}
			return deepest
		}
		const depthOf = (selection: SelectionNode): number => {
			if (selection.kind === Kind.FIELD) {
				if (introspection.has(selection.name.value)) return 0
				return 1 + depth(selection.selectionSet)
			}
			if (selection.kind === Kind.INLINE_FRAGMENT) {
				return depth(selection.selectionSet)
			}
			const name = selection.name.value
			const known = fragments.get(name)
			if (known !== undefined) return known
			fragments.set(name, 0)
			const measured = depth(context.getFragment(name)?.selectionSet)
			fragments.set(name, measured)
			return measured
		}
		return {
			OperationDefinition: (node) => {
				const measured = depth(node.selectionSet)
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
