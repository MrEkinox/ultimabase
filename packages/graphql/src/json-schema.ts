// A schema's standard JSON Schema export, which `data.ts` types (D-45).

import { Refused } from 'ultimabase'

/** A JSON Schema, or one of its nodes. */
export type Node = { readonly [key: string]: unknown }
export type Side = 'input' | 'output'

export const isNode = (value: unknown): value is Node =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** A schema's JSON Schema, or startup stops naming `where` (D-45). */
export function jsonSchemaOf(schema: object, side: Side, where: string): Node {
	const standard: unknown = Reflect.get(schema, '~standard')
	const exporter = isNode(standard) ? standard['jsonSchema'] : undefined
	const exported = isNode(exporter) ? exporter[side] : undefined
	if (typeof exported !== 'function') {
		throw new Refused(`${where} has no standard JSON Schema export.`)
	}
	try {
		const node: unknown = Reflect.apply(exported, exporter, [
			{ target: 'draft-2020-12' },
		])
		if (isNode(node)) return node
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		throw new Refused(`${where}: ${reason}.`, { cause: error })
	}
	throw new Refused(`${where}'s JSON Schema is not an object.`)
}

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
