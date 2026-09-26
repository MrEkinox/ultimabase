import {
	QueryBuilder,
	increment,
	normalizeUpdateExpression,
	type CreateManyOperationAst,
	type UpsertManyOperationAst,
} from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import type { PluginSchemaMutationOperationAst } from '../schema-mutations/contracts.js'
import { expect, it } from 'vitest'

import {
	collectOperationFieldInputs,
	collectUpdateExpressionFieldNames,
	readRuntimeFieldValuePath,
	replaceRuntimeFieldValuePath,
	transformOperationFieldInputs,
} from './field-values.js'

it('keeps the Runtime-specific malformed update diagnostic', () => {
	expect(() => collectUpdateExpressionFieldNames({ kind: 'unknown' })).toThrow(
		'Runtime field inputs require an update expression',
	)
})

const TraversalRecord = Schema.define({
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
		count: increment(1),
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

it('collects plugin schema mutation effect fields through the logical operation', () => {
	const update = normalizeUpdateExpression(TraversalRecord, { count: increment(1) })
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
