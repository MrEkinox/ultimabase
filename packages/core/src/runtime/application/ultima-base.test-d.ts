import { definePlugin } from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import { type DatabaseAdapter, UltimaBase } from '../index.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import type { QueryResult } from '../../query/index.js'

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
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.typed-ultimabase-database',
	capabilities: {
		provides: [provideTestDatabaseAdapter(adapter)],
	},
	setup: () => {
		return { dialect: 'fixture' as const }
	},
})

test('preserves exact schema and plugin tuples behind the concise facade', () => {
	const ultimabase = new UltimaBase({
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
		Promise<readonly QueryResult<typeof articleSchema>[]>
	>()
	expectTypeOf(
		ultimabase.application.getPlugin(databasePlugin.manifest.identity.pluginId),
	).toEqualTypeOf<{
		readonly dialect: 'fixture'
	}>()
	expectTypeOf(ultimabase.start()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(ultimabase.stop()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(ultimabase.dispose()).toEqualTypeOf<Promise<void>>()
	// Ownership remains a Runtime identity check because QueryBuilder stays application-free.
	void otherSchema.findMany(undefined, { ultimabase })
	new UltimaBase({
		schemas: [articleSchema],
		plugins: [databasePlugin],
		// @ts-expect-error -- Runtime assembly options remain closed and documented.
		unknown: true,
	})
})
