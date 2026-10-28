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
