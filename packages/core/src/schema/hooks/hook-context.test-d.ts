import { expectTypeOf, test } from 'vitest'

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

test('HookContext exposes exact query typing without privileged controls', async () => {
	const created = await context
		.query(AuditSchema)
		.create({ action: 'post.create' })
	const selected = await context
		.query(AuditSchema)
		.select('id', 'action')
		.find()

	expectTypeOf(created.action).toEqualTypeOf<string>()
	expectTypeOf(created.secret).toEqualTypeOf<string | undefined>()
	expectTypeOf(selected).toEqualTypeOf<
		readonly InferQueryResult<typeof AuditSchema, 'action' | 'id'>[]
	>()
	expectTypeOf(context.access.mode).toEqualTypeOf<
		'anonymous' | 'master' | 'user'
	>()
	expectTypeOf(context.source).toEqualTypeOf<string>()

	// @ts-expect-error -- Private request metadata never enters HookContext.
	void context.metadata
	// @ts-expect-error -- HookContext never exposes master elevation.
	void context.useMasterKey
	// @ts-expect-error -- HookContext never exposes transaction finalization.
	void context.commit
	// @ts-expect-error -- HookContext never exposes hook bypasses.
	void context.skipHooks
})
