import {
	normalizeUpdateExpression,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DeleteOneOperationAst,
	type FindManyOperationAst,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '../../query/index.js'

import type { PluginSchemaMutationOperationAst } from '../schema-mutations/contracts.js'
import { expect, it } from 'vitest'

import {
	collectOperationFieldInputs,
	collectUpdateExpressionFieldNames,
	readRuntimeFieldValuePath,
	replaceRuntimeFieldValuePath,
	transformOperationFieldInputs,
} from './field-values.js'
import { UltimaBase } from '../application/ultima-base.js'
import { QueryBuilder } from '../../plugin.js'

it('keeps the Runtime-specific malformed update diagnostic', () => {
	expect(() => collectUpdateExpressionFieldNames({ kind: 'unknown' })).toThrow(
		'Runtime field inputs require an update expression',
	)
})

const TraversalRecord = UltimaBase.Schema.define({
	className: 'RuntimeFieldTraversal',
	fields: (field) => ({
		count: field.int(),
		sections: field.object({
			list: true,
			fields: (nested) => ({ label: nested.string() }),
		}),
		title: field.string({ indexed: 'unique', required: true }),
	}),
})

const query = new QueryBuilder(TraversalRecord).ast

it('deduplicates affected fields in first-occurrence order without mutating input', () => {
	const update = {
		kind: 'update-expression',
		operations: [
			{ kind: 'increment', field: 'count', value: 1 },
			{ kind: 'set', field: 'title', value: 'changed' },
			{ kind: 'decrement', field: 'count', value: 2 },
		],
	}
	const names = collectUpdateExpressionFieldNames(update)

	expect(names).toStrictEqual(['count', 'title'])
	expect(Object.isFrozen(names)).toBe(true)
	expect(update.operations).toHaveLength(3)
	const malformed = {
		...update,
		operations: [...update.operations, { kind: 'set', field: 1, value: 0 }],
	}
	expect(() => collectUpdateExpressionFieldNames(malformed)).toThrow(
		'Runtime field inputs contain an update without a field name',
	)
})

it.each([
	{ kind: 'unknown', field: 'count', value: 1 },
	{ kind: 'set', field: 'count' },
	{ kind: 'set', field: 1, value: 1 },
])(
	'rejects malformed update values instead of skipping them: %j',
	(candidate) => {
		const update = { kind: 'update-expression', operations: [candidate] }
		const operation = {
			kind: 'update-one',
			query,
			update,
		} satisfies UpdateOneOperationAst<typeof TraversalRecord, typeof update>

		expect(() =>
			collectOperationFieldInputs(operation, 'parent-first'),
		).toThrow('Runtime field inputs contain an invalid update operation')
	},
)

it('keeps collection item and nested list paths distinct', () => {
	const operation = {
		kind: 'create-many',
		schema: query.schema,
		selection: query.selection,
		inputs: [
			{ title: 'first', sections: [{ label: 'A' }, { label: 'B' }] },
			{ title: 'second', sections: [{ label: 'C' }] },
		],
	} satisfies CreateManyOperationAst<typeof TraversalRecord>

	// A field path identifies the schema field; a value path identifies one item.
	const inputs = collectOperationFieldInputs(operation, 'children-first')
	const labels = inputs.filter(
		({ fieldPath }) => fieldPath.join('.') === 'sections.label',
	)
	expect(
		labels.map(({ itemIndex, value, valuePath }) => ({
			itemIndex,
			value,
			valuePath,
		})),
	).toStrictEqual([
		{
			itemIndex: 0,
			value: 'A',
			valuePath: ['inputs', 0, 'sections', 0, 'label'],
		},
		{
			itemIndex: 0,
			value: 'B',
			valuePath: ['inputs', 0, 'sections', 1, 'label'],
		},
		{
			itemIndex: 1,
			value: 'C',
			valuePath: ['inputs', 1, 'sections', 0, 'label'],
		},
	])
	expect(
		inputs.findIndex(
			({ fieldPath }) => fieldPath.join('.') === 'sections.label',
		),
	).toBeLessThan(
		inputs.findIndex(({ fieldPath }) => fieldPath.join('.') === 'sections'),
	)
})

it('keeps create and update values separate for every bulk upsert item', () => {
	const update = normalizeUpdateExpression(TraversalRecord, {
		count: { increment: 1 },
	})
	const operation = {
		kind: 'upsert-many',
		schema: query.schema,
		selection: query.selection,
		items: ['first', 'second'].map((title) => ({
			query: new QueryBuilder(TraversalRecord).where({ title: { eq: title } })
				.ast,
			target: { kind: 'unique-upsert-target', fields: ['title'] } as const,
			create: { title },
			update,
		})),
	} satisfies UpsertManyOperationAst<typeof TraversalRecord, typeof update>

	const inputs = collectOperationFieldInputs(operation, 'parent-first')
	expect(
		inputs.map(({ itemIndex, mode, fieldPath }) => [
			itemIndex,
			mode,
			fieldPath,
		]),
	).toStrictEqual([
		[0, 'create', ['title']],
		[0, 'update', ['count']],
		[1, 'create', ['title']],
		[1, 'update', ['count']],
	])
	expect(inputs[3]?.valuePath).toStrictEqual([
		'items',
		1,
		'update',
		'operations',
		0,
		'value',
	])
})

it('normalizes every singular and set-based field-input root', () => {
	const update = normalizeUpdateExpression(TraversalRecord, {
		count: { increment: 1 },
	})
	const target = { kind: 'unique-upsert-target', fields: ['title'] } as const
	const createOne = {
		kind: 'create-one',
		schema: query.schema,
		selection: query.selection,
		input: { title: 'created' },
	} satisfies CreateOneOperationAst<typeof TraversalRecord>
	const updateOne = {
		kind: 'update-one',
		query,
		update,
	} satisfies UpdateOneOperationAst<typeof TraversalRecord, typeof update>
	const updateMany = {
		kind: 'update-many',
		query,
		update,
	} satisfies UpdateManyOperationAst<typeof TraversalRecord, typeof update>
	const upsertOne = {
		kind: 'upsert-one',
		query,
		target,
		create: { title: 'upserted' },
		update,
	} satisfies UpsertOneOperationAst<typeof TraversalRecord, typeof update>
	const deleteOne = {
		kind: 'delete-one',
		query,
	} satisfies DeleteOneOperationAst<typeof TraversalRecord>
	const findMany = {
		kind: 'find-many',
		query,
	} satisfies FindManyOperationAst<typeof TraversalRecord>
	const summarize = (
		operation: Parameters<typeof collectOperationFieldInputs>[0],
	) =>
		collectOperationFieldInputs(operation, 'parent-first').map(
			({ itemIndex, kind, mode, valuePath }) => [
				kind,
				mode,
				itemIndex,
				valuePath,
			],
		)

	expect(
		[createOne, updateOne, updateMany, upsertOne, deleteOne, findMany].map(
			summarize,
		),
	).toStrictEqual([
		[['create-one', 'create', 0, ['input', 'title']]],
		[['update-one', 'update', 0, ['update', 'operations', 0, 'value']]],
		[['update-many', 'update', 0, ['update', 'operations', 0, 'value']]],
		[
			['upsert-one', 'create', 0, ['create', 'title']],
			['upsert-one', 'update', 0, ['update', 'operations', 0, 'value']],
		],
		[],
		[],
	])
})

it('collects plugin schema mutation effect fields through the logical operation', () => {
	const update = normalizeUpdateExpression(TraversalRecord, {
		count: { increment: 1 },
	})
	const operation = {
		command: 'archive',
		effect: { kind: 'update', update },
		id: 'record-1',
		input: { reason: 'superseded' },
		item: undefined,
		kind: 'plugin-schema-mutation',
		mutation: {
			authority: 'request',
			effect: 'update',
			errors: [],
			input: {},
			kind: 'plugin-schema-mutation',
			name: 'fixture.workflow.archive',
			returning: 'after',
			select: {},
			target: 'one',
			version: '1.0.0',
		},
		originalItem: undefined,
		owner: {
			kind: 'plugin',
			pluginId: 'fixture.workflow',
			version: '1.0.0',
		},
		query,
	} satisfies PluginSchemaMutationOperationAst

	expect(
		collectOperationFieldInputs(operation, 'parent-first').map(
			({ fieldPath, kind, mode, valuePath }) => ({
				fieldPath,
				kind,
				mode,
				valuePath,
			}),
		),
	).toStrictEqual([
		{
			fieldPath: ['count'],
			kind: 'plugin-schema-mutation',
			mode: 'update',
			valuePath: ['effect', 'update', 'operations', 0, 'value'],
		},
	])
	expect(
		collectOperationFieldInputs(
			{ ...operation, effect: { kind: 'delete' } },
			'parent-first',
		),
	).toStrictEqual([])
})

it('transforms children before their parent without mutating the input', async () => {
	const operation = {
		kind: 'create-many',
		schema: query.schema,
		selection: query.selection,
		inputs: [{ title: 'first', sections: [{ label: 'before' }] }],
	} satisfies CreateManyOperationAst<typeof TraversalRecord>
	const visited: unknown[] = []

	const transformed = await transformOperationFieldInputs(
		operation,
		({ fieldPath, value }) => {
			if (fieldPath.join('.') === 'sections.label') return 'after'
			if (fieldPath.join('.') === 'sections') visited.push(value)
			return undefined
		},
	)

	expect(visited).toStrictEqual([[{ label: 'after' }]])
	expect(transformed.inputs[0]?.sections).toStrictEqual([{ label: 'after' }])
	expect(operation.inputs[0]?.sections).toStrictEqual([{ label: 'before' }])
	expect(
		readRuntimeFieldValuePath(transformed, [
			'inputs',
			0,
			'sections',
			0,
			'label',
		]),
	).toStrictEqual({
		found: true,
		value: 'after',
	})
	expect(
		readRuntimeFieldValuePath(transformed, ['inputs', 0, 'sections', 2]),
	).toStrictEqual({
		found: false,
	})
	expect(() =>
		replaceRuntimeFieldValuePath(transformed, ['inputs', 2], 'invalid'),
	).toThrow('Runtime field value replacement path is unavailable')
})
