import { booleanField, defineSchema, stringField } from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import {
	createQueryAst,
	type QueryAstNode,
	type QueryExpressionNode,
	type QueryFieldName,
	type QueryOrderingNode,
	type QuerySelectionNode,
} from '../index.js'

const postSchema = defineSchema({
	className: 'Post',
	fields: {
		title: stringField(),
		published: booleanField({ default: false }),
	},
})

interface FixtureExpressionNode extends QueryExpressionNode {
	readonly kind: 'fixture-expression'
	readonly field: QueryFieldName<typeof postSchema>
}

const assertExhaustive = (value: never): never => {
	throw new TypeError(`Unexpected query node: ${String(value)}`)
}

const readNodeKind = (
	node: QueryAstNode<typeof postSchema, FixtureExpressionNode>,
): string => {
	switch (node.kind) {
		case 'query':
		case 'schema':
		case 'selection':
		case 'selected-field':
		case 'where':
		case 'fixture-expression':
		case 'ordering':
		case 'order':
		case 'offset-pagination':
			return node.kind
		default:
			return assertExhaustive(node)
	}
}

test('types the initial AST from the exact schema definition', () => {
	const ast = createQueryAst(postSchema)

	expectTypeOf(ast.kind).toEqualTypeOf<'query'>()
	expectTypeOf(ast.schema.definition).toEqualTypeOf<typeof postSchema>()
	expectTypeOf(ast.where).toEqualTypeOf<undefined>()
	expectTypeOf(ast.pagination).toEqualTypeOf<undefined>()
	expectTypeOf<QueryFieldName<typeof postSchema>>().toEqualTypeOf<
		'title' | 'published' | 'id' | 'createdAt' | 'updatedAt'
	>()
	expectTypeOf<'sql'>().not.toExtend<keyof typeof ast>()
	expectTypeOf<'transport'>().not.toExtend<keyof typeof ast>()
})

test('restricts selection and ordering nodes to schema field names', () => {
	const selection = {
		kind: 'selection',
		fields: [{ kind: 'selected-field', field: 'title' }],
	} as const satisfies QuerySelectionNode<QueryFieldName<typeof postSchema>>
	const ordering = {
		kind: 'ordering',
		orders: [{ kind: 'order', field: 'createdAt', direction: 'descending' }],
	} as const satisfies QueryOrderingNode<QueryFieldName<typeof postSchema>>

	expectTypeOf(selection.fields[0].field).toEqualTypeOf<'title'>()
	expectTypeOf(ordering.orders[0].direction).toEqualTypeOf<'descending'>()

	const invalidSelection: QuerySelectionNode<
		QueryFieldName<typeof postSchema>
	> = {
		kind: 'selection',
		fields: [
			{
				kind: 'selected-field',
				// @ts-expect-error -- Unknown schema fields cannot enter typed nodes.
				field: 'missing',
			},
		],
	}

	expectTypeOf(invalidSelection).toExtend<
		QuerySelectionNode<QueryFieldName<typeof postSchema>>
	>()
})

test('keeps every structural node exhaustively discriminated and readonly', () => {
	const ast = createQueryAst(postSchema)

	expectTypeOf(readNodeKind).returns.toBeString()
	// @ts-expect-error -- AST roots cannot change after construction.
	ast.where = undefined
	// @ts-expect-error -- Selection collections cannot change after construction.
	ast.selection.fields = []
})
