// A schema's standard JSON Schema export, which `data.ts` types (D-45).

import type { Node } from '@ultimabase/http/internal'
import { isNode, jsonSchemaOf } from '@ultimabase/http/internal'
import { Refused } from 'ultimabase'

export type Side = 'input' | 'output'

/** A json field's JSON Schema, `undefined` without one (D-125). */
export function exportOf(schema: object, side: Side): Node | undefined {
	try {
		return jsonSchemaOf(schema, side, '')
	} catch (error) {
		if (error instanceof Refused) return undefined
		throw error
	}
}

/** The JSON Schema's shared nodes, by id. */
export const defsOf = (root: Node): Node =>
	isNode(root['$defs']) ? root['$defs'] : {}

/** A node with the `$defs` it reaches: what one shape of a scalar is. */
export function shapeOf(node: Node, defs: Node): string {
	const reached = new Map<string, unknown>()
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) value.forEach(visit)
		if (!isNode(value)) return
		const ref = value['$ref']
		const id = typeof ref === 'string' ? ref.slice(8) : ''
		if (id !== '' && !reached.has(id)) {
			reached.set(id, defs[id])
			visit(defs[id])
		}
		Object.values(value).forEach(visit)
	}
	visit(node)
	return JSON.stringify([node, [...reached]])
}

/** Whether a node takes `null`, as `type` or a variant says. */
export function takesNull(node: Node): boolean {
	const listed: unknown = node['anyOf'] ?? node['oneOf'] ?? node['type']
	return (
		Array.isArray(listed) &&
		listed.some(
			(item) => item === 'null' || (isNode(item) && item['type'] === 'null'),
		)
	)
}
