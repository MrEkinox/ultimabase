import {
	QueryBuilder,
	Schema,
	SchemaRegistry,
	increment,
	normalizeUpdateExpression,
	type DeleteManyOperationAst,
	type UpdateManyOperationAst,
} from '@ultimabase/core'
import { expect, it } from 'vitest'

import {
	fieldAccess,
	schemaAccess,
	type AccessContributionDefinition,
	type OwnedAccessContribution,
} from '../contributions.js'
import { compileAccessPlan } from '../authoring/compiler.js'
import type { AccessDefaultPolicy } from '../authoring/plan.js'
import { requiresAccessPreparedMutationItems } from './item-access.js'

const Document = Schema.define({
	className: 'AccessPreparedSetDecision',
	fields: (field) => ({ score: field.int() }),
})
const scoreField = Document.fields.score
if (scoreField?.kind !== 'int') throw new TypeError('Expected the score field')

const defaults: AccessDefaultPolicy = {
	create: false,
	delete: false,
	read: { count: false, exists: false, many: false, one: false },
	update: false,
	upsert: false,
	schemaMutations: false,
}

const owned = (
	definition: AccessContributionDefinition,
): OwnedAccessContribution => ({
	contributionId: 'prepared-set-decision',
	definition,
	owner: { pluginId: 'fixture.prepared-set-decision' },
	pluginVersion: '1.0.0',
})

const query = new QueryBuilder(Document).ast
const update = normalizeUpdateExpression(Document, { score: increment(1) })
const updateMany = {
	kind: 'update-many',
	query,
	update,
} satisfies UpdateManyOperationAst<typeof Document, typeof update>
const deleteMany = {
	kind: 'delete-many',
	query,
} satisfies DeleteManyOperationAst<typeof Document>

it('requests set preimages only when item or value-dependent rules need them', () => {
	const registry = new SchemaRegistry([Document])
	const staticPlan = compileAccessPlan(registry, defaults)
	const itemPlan = compileAccessPlan(registry, defaults, [
		owned(schemaAccess(Document, { delete: { item: () => true } })),
	])
	const fieldPlan = compileAccessPlan(registry, defaults, [
		owned(
			fieldAccess(Document, scoreField, ['score'], {
				write: {
					clear: false,
					fill: true,
					replace: ({ value }) => typeof value === 'number' && value < 5,
				},
			}),
		),
	])

	// Skipping a preimage would bypass a rule that needs the persisted target.
	expect(requiresAccessPreparedMutationItems(staticPlan, updateMany)).toBe(
		false,
	)
	expect(requiresAccessPreparedMutationItems(staticPlan, deleteMany)).toBe(
		false,
	)
	expect(requiresAccessPreparedMutationItems(itemPlan, deleteMany)).toBe(true)
	expect(requiresAccessPreparedMutationItems(fieldPlan, updateMany)).toBe(true)
})
