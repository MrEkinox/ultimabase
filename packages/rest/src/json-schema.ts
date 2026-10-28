// A function's standard JSON Schema exports (D-45), read as GraphQL reads
// them: its input's tells a GET's string parameters from its JSON ones, its
// output's whether it accepts `null`.
import type { Node } from '@ultimabase/http/internal'
import { isNode } from '@ultimabase/http/internal'

/** The node a `$ref` names among the root's `$defs`, or the node itself. */
export function resolved(node: Node, root: Node): Node {
	const ref = node['$ref']
	if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) return node
	const defs = isNode(root['$defs']) ? root['$defs'] : {}
	const found = defs[ref.slice(8)]
	return isNode(found) ? found : node
}

/** A value only ever a string, which a query parameter holds as is. */
export function isText(node: Node, root: Node): boolean {
	const own = resolved(node, root)
	const { type } = own
	if (type === 'string') return true
	// `['string', 'null']`, a nullable string.
	if (Array.isArray(type)) {
		return (
			type.includes('string') &&
			type.every((each) => each === 'string' || each === 'null')
		)
	}
	if (typeof own['const'] === 'string') return true
	const values = own['enum']
	if (Array.isArray(values)) {
		return (
			values.length > 0 && values.every((value) => typeof value === 'string')
		)
	}
	const variants = own['anyOf'] ?? own['oneOf']
	if (!Array.isArray(variants)) return false
	const kept = variants
		.filter(isNode)
		.filter((each) => resolved(each, root)['type'] !== 'null')
	return kept.length > 0 && kept.every((each) => isText(each, root))
}

/** A node that accepts `null`, as GraphQL types a nullable output. */
export function acceptsNull(node: Node): boolean {
	const variants: unknown = node['anyOf'] ?? node['oneOf']
	if (Array.isArray(variants)) {
		return variants.some((each) => isNode(each) && each['type'] === 'null')
	}
	const { type } = node
	return Array.isArray(type) ? type.includes('null') : type === 'null'
}
