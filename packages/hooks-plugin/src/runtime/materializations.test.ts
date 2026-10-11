import {
	normalizeUpdateExpression,
	type UpdateOneOperationAst,
} from '@ultimabase/core'
import { UltimaBase, type SchemaItem } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import type { DatabaseOperationOutcome } from '@ultimabase/core'
import { applyUpdateToTarget, collectMutationAfterItems } from './lifecycle.js'

const schema = UltimaBase.Schema.define({
	className: 'MutationItemPairs',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})
const original: SchemaItem<typeof schema> = {
	createdAt: '2026-08-08T10:00:00.000Z',
	id: '00000000-0000-7000-8000-000000000001',
	title: 'Before',
	updatedAt: '2026-08-08T10:00:00.000Z',
}
const current: SchemaItem<typeof schema> = {
	...original,
	title: 'After',
	updatedAt: '2026-08-08T10:01:00.000Z',
}

describe('parent mutation item materializations', () => {
	it('applies scalar update values to one locked target', () => {
		const update = normalizeUpdateExpression(schema, { title: 'After' })

		expect(applyUpdateToTarget(schema, original, update)).toStrictEqual({
			...original,
			title: 'After',
		})
	})

	it('keeps the target unchanged for relation-only link changes', () => {
		const relationOnly = immutableRecord({
			kind: 'update-expression' as const,
			operations: [
				immutableRecord({
					field: 'tags',
					kind: 'relation' as const,
					value: immutableRecord({ action: 'connect' as const, targets: [] }),
				}),
			],
		})

		expect(applyUpdateToTarget(schema, original, relationOnly)).toBe(original)
	})

	it('builds exact post-persistence pairs independently from selection', () => {
		const outcome = immutableRecord({
			materializations: [
				immutableRecord({
					current,
					kind: 'update' as const,
					previous: original,
				}),
			],
			result: current,
		}) satisfies DatabaseOperationOutcome<UpdateOneOperationAst<typeof schema>>

		expect(collectMutationAfterItems(outcome)).toStrictEqual([
			{ item: current, originalItem: original },
		])
		expect(Object.isFrozen(collectMutationAfterItems(outcome))).toBe(true)
	})
})
