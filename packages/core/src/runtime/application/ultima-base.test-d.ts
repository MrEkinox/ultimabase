import { definePlugin } from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
	UltimaBase,
} from '../index.js'
import type { InferQueryResult } from '../../query/index.js'

const articleSchema = Schema.define({
	className: 'TypedUltimaBaseArticle',
	fields: (field) => ({ title: field.string() }),
})
const otherSchema = Schema.define({
	className: 'TypedOtherUltimaBaseArticle',
	fields: (field) => ({ name: field.string() }),
})
declare const adapter: DatabaseAdapter
const databasePlugin = definePlugin({
	name: 'fixture.typed-ultimabase-database',
	setup: ({ services }) => {
		services.provide(databaseAdapterServiceToken, adapter)

		return { dialect: 'fixture' as const }
	},
})

test('preserves exact schema and plugin tuples behind the concise facade', () => {
	const ultimabase = new UltimaBase({
		access: { default: { field: true, operation: false } },
		schemas: [articleSchema],
		plugins: [databasePlugin],
		validation: { timezone: 'Europe/Paris' },
	})

	expectTypeOf(ultimabase).toEqualTypeOf<
		UltimaBase<
			readonly [typeof articleSchema],
			readonly [typeof databasePlugin]
		>
	>()
	expectTypeOf(articleSchema.findMany(undefined, { ultimabase })).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema>[]>
	>()
	expectTypeOf(
		ultimabase.application.getPlugin(databasePlugin.name),
	).toEqualTypeOf<{
		readonly dialect: 'fixture'
	}>()
	expectTypeOf(ultimabase.start()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(ultimabase.stop()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(ultimabase.dispose()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(ultimabase.application.accessDefaults).toEqualTypeOf<{
		readonly field: boolean
		readonly operation: boolean
	}>()

	// Ownership remains a Runtime identity check because QueryBuilder stays application-free.
	void otherSchema.findMany(undefined, { ultimabase })
	new UltimaBase({
		schemas: [articleSchema],
		plugins: [databasePlugin],
		// @ts-expect-error -- Runtime assembly options remain closed and documented.
		unknown: true,
	})
})
