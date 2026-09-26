import {
	collectOperationFieldInputs,
	QueryBuilder,
	Schema,
	SchemaRegistry,
	increment,
	normalizeUpdateExpression,
	type DeleteManyOperationAst,
	type UpdateManyOperationAst,
	type UpsertManyOperationAst,
} from '@ultimabase/core'
import { expect, it } from 'vitest'

import {
	fieldAccess,
	schemaAccess,
	type AccessContributionDefinition,
	type OwnedAccessContribution,
} from '../contributions.js'
import { compileAccessPlan } from '../authoring/compiler.js'
import {
	accessOperationKinds,
	readAccessOperationFamily,
	type AccessDefaultPolicy,
} from '../authoring/plan.js'
import { requiresAccessPreparedMutationItems } from './item-access.js'
import { collectUpdateFieldValues } from './mutation-transitions.js'

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

it('classifies every native terminal through one Access family map', () => {
	expect(
		Object.fromEntries(
			accessOperationKinds.map((kind) => [
				kind,
				readAccessOperationFamily(kind),
			]),
		),
	).toEqual({
		count: 'read',
		'create-many': 'create',
		'create-one': 'create',
		'delete-many': 'delete',
		'delete-one': 'delete',
		exists: 'read',
		'find-many': 'read',
		'find-one': 'read',
		get: 'read',
		'update-many': 'update',
		'update-one': 'update',
		'upsert-many': 'upsert',
		'upsert-one': 'upsert',
	})
})

it('derives update values from Core traversal without mixing bulk items', () => {
	const secondUpdate = normalizeUpdateExpression(Document, {
		score: increment(2),
	})
	const operation = {
		items: [update, secondUpdate].map((itemUpdate, index) => ({
			create: { score: index },
			query,
			target: { fields: ['score'], kind: 'unique-upsert-target' } as const,
			update: itemUpdate,
		})),
		kind: 'upsert-many',
		schema: query.schema,
		selection: query.selection,
	} satisfies UpsertManyOperationAst<typeof Document, typeof update>
	const inputs = collectOperationFieldInputs(operation, 'parent-first')

	expect(Object.fromEntries(collectUpdateFieldValues(inputs))).toEqual({
		score: 1,
	})
	expect(Object.fromEntries(collectUpdateFieldValues(inputs, 1))).toEqual({
		score: 2,
	})
})

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
