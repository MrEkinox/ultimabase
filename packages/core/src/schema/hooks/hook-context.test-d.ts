import { expectTypeOf, test } from 'vitest'

import { RequestContextValue } from '../../access/request/context-value.js'
import { Schema } from '../schema/definition.js'
import { stringField } from '../fields/builtins/string.js'
import type { InferQueryResult } from '../../query/query/result.js'
import type { HookContext } from './hook-context.js'

const AuditSchema = Schema.define({
	className: 'TypedHookContextAudit',
	fields: {
		action: stringField({ validation: { required: true } }),
		secret: stringField(),
	},
})

declare const context: HookContext
const principal = new RequestContextValue<Readonly<{ id: string }>>(
	'fixture.principal',
	(value: unknown) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('id' in value) ||
			typeof value.id !== 'string'
		) {
			throw new TypeError('Fixture principal must contain a string id')
		}

		return Object.freeze({ id: value.id })
	},
)

test('ambient QueryBuilder keeps exact typing without adding controls to HookContext', async () => {
	const created = await AuditSchema.createOne({
		data: { action: 'post.create' },
	})
	const selected = await AuditSchema.findMany({
		select: { id: true, action: true },
	})

	expectTypeOf(created.action).toEqualTypeOf<string>()
	expectTypeOf(created.secret).toEqualTypeOf<string | null>()
	expectTypeOf(selected).toEqualTypeOf<
		readonly InferQueryResult<typeof AuditSchema, 'action' | 'id'>[]
	>()
	expectTypeOf(context.access.mode).toEqualTypeOf<'anonymous' | 'master'>()
	expectTypeOf(context.source).toEqualTypeOf<string>()
	expectTypeOf(context.getValue(principal)).toEqualTypeOf<
		Readonly<{ id: string }> | undefined
	>()

	// @ts-expect-error -- QueryBuilder execution is ambient instead of context plumbing.
	void context.query
	// @ts-expect-error -- Private request metadata never enters HookContext.
	void context.metadata
	// @ts-expect-error -- HookContext never exposes master elevation.
	void context.useMasterKey
	// @ts-expect-error -- HookContext can read but never derive request values.
	void context.withValue
	// @ts-expect-error -- HookContext never exposes transaction finalization.
	void context.commit
	// @ts-expect-error -- HookContext never exposes hook bypasses.
	void context.skipHooks
})
