import {
	increment,
	normalizeUpdateExpression,
	Query,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DeleteOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '../../query/index.js'
import {
	intField,
	objectField,
	Schema,
	stringField,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	collectOperationFieldInputs,
	collectUpdateExpressionFieldNames,
	transformOperationFieldInputs,
	type RuntimeFieldInputValue,
} from './field-inputs.js'

const traversalSchema = Schema.define({
	className: 'FieldInputTraversal',
	fields: {
		'literal.name': stringField(),
		count: intField(),
		profile: objectField({
			fields: {
				displayName: stringField(),
				contact: objectField({
					fields: { email: stringField() },
				}),
			},
		}),
		groups: objectField({
			list: [true, true],
			fields: {
				label: stringField(),
				details: objectField({
					fields: { code: stringField() },
				}),
			},
		}),
		removable: stringField(),
	},
})

const schemaNode = new Query(traversalSchema).ast.schema

const createInput = (suffix: string) => ({
	'literal.name': `literal-${suffix}`,
	count: 1,
	profile: {
		displayName: `name-${suffix}`,
		contact: { email: `${suffix}@example.com` },
	},
	groups: [
		[
			{
				label: `group-${suffix}`,
				details: { code: `code-${suffix}` },
			},
		],
	],
	removable: `remove-${suffix}`,
})

/** Keeps ordering assertions readable without discarding segmented path evidence. */
const describeInputs = (inputs: readonly RuntimeFieldInputValue[]) =>
	inputs.map(({ fieldPath, itemIndex, mode, valuePath }) => ({
		fieldPath,
		itemIndex,
		mode,
		valuePath,
	}))

describe('runtime field inputs', () => {
	it('traverses nested objects and multidimensional lists in both lifecycle orders', () => {
		const operation = {
			input: createInput('one'),
			kind: 'create-one',
			schema: schemaNode,
		} satisfies CreateOneOperationAst<typeof traversalSchema>

		const childrenFirst = collectOperationFieldInputs(
			operation,
			'children-first',
		)
		const parentFirst = collectOperationFieldInputs(operation, 'parent-first')

		expect(childrenFirst.map(({ fieldPath }) => fieldPath)).toStrictEqual([
			['literal.name'],
			['count'],
			['profile', 'displayName'],
			['profile', 'contact', 'email'],
			['profile', 'contact'],
			['profile'],
			['groups', 'label'],
			['groups', 'details', 'code'],
			['groups', 'details'],
			['groups'],
			['removable'],
		])
		expect(parentFirst.map(({ fieldPath }) => fieldPath)).toStrictEqual([
			['literal.name'],
			['count'],
			['profile'],
			['profile', 'displayName'],
			['profile', 'contact'],
			['profile', 'contact', 'email'],
			['groups'],
			['groups', 'label'],
			['groups', 'details'],
			['groups', 'details', 'code'],
			['removable'],
		])
		expect(childrenFirst[0]?.valuePath).toStrictEqual(['input', 'literal.name'])
		expect(
			childrenFirst.find(({ fieldPath }) => fieldPath.at(-1) === 'code')
				?.valuePath,
		).toStrictEqual(['input', 'groups', 0, 0, 'details', 'code'])
		expect(Object.isFrozen(childrenFirst)).toBe(true)
		expect(Object.isFrozen(childrenFirst[0]?.fieldPath)).toBe(true)
	})

	it('applies child-first replacements immutably and lets parents observe children', async () => {
		const input = createInput('transform')
		const operation = {
			input,
			kind: 'create-one',
			schema: schemaNode,
		} satisfies CreateOneOperationAst<typeof traversalSchema>
		let parentValue: unknown

		const transformed = await transformOperationFieldInputs(
			operation,
			({ fieldPath, value }) => {
				if (fieldPath.length === 1 && fieldPath[0] === 'profile') {
					parentValue = value
					return undefined
				}

				return typeof value === 'string' ? value.toUpperCase() : undefined
			},
		)

		expect(parentValue).toStrictEqual({
			contact: { email: 'TRANSFORM@EXAMPLE.COM' },
			displayName: 'NAME-TRANSFORM',
		})
		expect(transformed.input).toMatchObject({
			'literal.name': 'LITERAL-TRANSFORM',
			profile: {
				contact: { email: 'TRANSFORM@EXAMPLE.COM' },
				displayName: 'NAME-TRANSFORM',
			},
			groups: [[{ label: 'GROUP-TRANSFORM' }]],
		})
		expect(operation.input).toBe(input)
		expect(operation.input.profile.displayName).toBe('name-transform')
		expect(Object.isFrozen(transformed)).toBe(true)
		expect(Object.isFrozen(transformed.input.profile)).toBe(true)
		expect(Object.isFrozen(transformed.input.groups)).toBe(true)

		const observed = await transformOperationFieldInputs(
			operation,
			() => undefined,
		)
		expect(observed).toBe(operation)
	})

	it('preserves stable create-many item ordering without inventing absent fields', () => {
		const first = createInput('first')
		const second = { 'literal.name': 'literal-second' }
		const operation = {
			inputs: [first, second],
			kind: 'create-many',
			options: { atomic: true },
			schema: schemaNode,
		} satisfies CreateManyOperationAst<typeof traversalSchema>

		const inputs = collectOperationFieldInputs(operation, 'children-first')

		expect(inputs.at(-1)).toMatchObject({
			fieldPath: ['literal.name'],
			itemIndex: 1,
			value: 'literal-second',
			valuePath: ['inputs', 1, 'literal.name'],
		})
		expect(inputs.filter(({ itemIndex }) => itemIndex === 1)).toHaveLength(1)
		expect(second).not.toHaveProperty('profile')
	})

	it('extracts and replaces update values including explicit null clears', async () => {
		const update = normalizeUpdateExpression(traversalSchema, {
			'literal.name': 'updated.literal',
			profile: {
				displayName: 'updated name',
				contact: { email: 'updated@example.com' },
			},
			removable: null,
			count: increment(2),
		})
		const operation = {
			kind: 'update-one',
			query: new Query(traversalSchema).ast,
			update,
		} as const

		expect(collectUpdateExpressionFieldNames(update)).toStrictEqual([
			'literal.name',
			'profile',
			'removable',
			'count',
		])
		expect(
			collectOperationFieldInputs(operation, 'children-first').map(
				({ fieldPath }) => fieldPath,
			),
		).toStrictEqual([
			['literal.name'],
			['profile', 'displayName'],
			['profile', 'contact', 'email'],
			['profile', 'contact'],
			['profile'],
			['removable'],
			['count'],
		])

		const transformed = await transformOperationFieldInputs(
			operation,
			({ value }) =>
				typeof value === 'string' ? value.toUpperCase() : undefined,
		)

		expect(transformed.update.operations).toContainEqual({
			field: 'removable',
			kind: 'set',
			value: null,
		})
		expect(transformed.update.operations).toContainEqual({
			field: 'literal.name',
			kind: 'set',
			value: 'UPDATED.LITERAL',
		})
		expect(update.operations).toContainEqual({
			field: 'literal.name',
			kind: 'set',
			value: 'updated.literal',
		})
	})

	it('visits and replaces branch-neutral upsert candidates in create-then-update order', async () => {
		const update = normalizeUpdateExpression(traversalSchema, {
			'literal.name': 'update-value',
		})
		const query = new Query(traversalSchema).equalTo('literal.name', 'lookup')
		const target = {
			fields: ['literal.name'],
			kind: 'unique-upsert-target',
		} as const
		const singular = {
			create: { 'literal.name': 'create-value' },
			kind: 'upsert-one',
			query: query.ast,
			target,
			update,
		} satisfies UpsertOneOperationAst<typeof traversalSchema, typeof update>
		const bulk = {
			items: [
				{
					create: { 'literal.name': 'create-first' },
					query: query.ast,
					target,
					update,
				},
				{
					create: { 'literal.name': 'create-second' },
					query: query.ast,
					target,
					update,
				},
			],
			kind: 'upsert-many',
			options: { atomic: true },
			schema: schemaNode,
		} satisfies UpsertManyOperationAst<typeof traversalSchema, typeof update>

		expect(
			describeInputs(collectOperationFieldInputs(singular, 'parent-first')),
		).toMatchObject([
			{ itemIndex: 0, mode: 'create', valuePath: ['create', 'literal.name'] },
			{
				itemIndex: 0,
				mode: 'update',
				valuePath: ['update', 'operations', 0, 'value'],
			},
		])
		expect(
			collectOperationFieldInputs(bulk, 'parent-first').map(
				({ itemIndex, mode }) => `${String(itemIndex)}:${mode}`,
			),
		).toStrictEqual(['0:create', '0:update', '1:create', '1:update'])

		const transformed = await transformOperationFieldInputs(
			bulk,
			({ value }) =>
				typeof value === 'string' ? value.toUpperCase() : undefined,
		)

		expect(transformed.items[0]?.create['literal.name']).toBe('CREATE-FIRST')
		expect(transformed.items[1]?.create['literal.name']).toBe('CREATE-SECOND')
		expect(transformed.items[0]?.update.operations[0]).toMatchObject({
			value: 'UPDATE-VALUE',
		})
		expect(bulk.items[0]?.create['literal.name']).toBe('create-first')
	})

	it('does not synthesize field inputs for read or delete operations', async () => {
		const operation = {
			kind: 'delete-one',
			query: new Query(traversalSchema).ast,
		} satisfies DeleteOneOperationAst<typeof traversalSchema>

		expect(
			collectOperationFieldInputs(operation, 'children-first'),
		).toStrictEqual([])
		await expect(
			transformOperationFieldInputs(operation, () => {
				throw new Error('visitor must remain unreachable')
			}),
		).resolves.toBe(operation)
	})
})
