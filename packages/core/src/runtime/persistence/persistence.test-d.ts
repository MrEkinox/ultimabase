import { expectTypeOf, test } from 'vitest'

import {
	definePlugin,
	normalizeUpdateExpression,
	persistencePlanRewriter,
	providePersistencePlanRewriter,
	QueryBuilder,
	rewriteDeletePersistencePlan,
	Schema,
	type DatabasePersistencePlan,
	type PersistencePlanOperationKind,
} from '../../index.js'

const articleSchema = Schema.define({
	className: 'PersistenceTypeArticle',
	fields: (field) => ({ deleted: field.boolean() }),
})
const noteSchema = Schema.define({
	className: 'PersistenceTypeNote',
	fields: (field) => ({ deleted: field.boolean() }),
})

test('preserves logical delete correlation across one physical update plan', () => {
	const definition = persistencePlanRewriter({
		operations: ['delete-one'],
		schema: articleSchema,
		rewrite: ({ logicalOperation, plan }) => {
			expectTypeOf(logicalOperation.kind).toEqualTypeOf<'delete-one'>()
			expectTypeOf(logicalOperation.query.schema.definition).toEqualTypeOf<
				typeof articleSchema
			>()
			const rewritten = rewriteDeletePersistencePlan(
				plan,
				normalizeUpdateExpression(articleSchema, { deleted: true }),
			)

			expectTypeOf(rewritten).toExtend<
				DatabasePersistencePlan<typeof logicalOperation>
			>()
			return rewritten
		},
	})
	const plugin = definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.persistence-types',
		version: '0.0.0',
		privileges: [{ name: 'persistence:rewrite', reason: 'Type fixture.' }],
		capabilities: [
			providePersistencePlanRewriter({
				contributionId: 'soft-delete',
				create: () => ({ value: definition }),
			}),
		],
	})

	expectTypeOf(plugin).not.toBeNever()
	expectTypeOf(
		new QueryBuilder(articleSchema).ast.schema.definition,
	).toEqualTypeOf<typeof articleSchema>()
})

test('exposes schema-mutation identity while retaining a Core-owned physical plan', () => {
	const definition = persistencePlanRewriter({
		operations: ['plugin-schema-mutation'],
		schema: articleSchema,
		rewrite: ({ logicalOperation, plan }) => {
			expectTypeOf(
				logicalOperation.kind,
			).toEqualTypeOf<'plugin-schema-mutation'>()
			expectTypeOf(plan).toExtend<DatabasePersistencePlan>()
			return plan
		},
	})

	expectTypeOf(definition.operations).toEqualTypeOf<
		readonly PersistencePlanOperationKind[]
	>()
})

test('infers every schema in one immutable rewriter target collection', () => {
	persistencePlanRewriter({
		operations: ['delete-one'],
		rewrite: ({ logicalOperation, plan }) => {
			expectTypeOf(logicalOperation.query.schema.definition).toEqualTypeOf<
				typeof articleSchema | typeof noteSchema
			>()
			return plan
		},
		schemas: [articleSchema, noteSchema],
	})
})
