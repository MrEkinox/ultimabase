import { definePlugin } from '@ultimabase/core'
import { Schema, stringField } from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
	UltimaBase,
	type UltimaBaseQuery,
} from '../index.js'

const articleSchema = new Schema({
	className: 'TypedUltimaBaseArticle',
	fields: { title: stringField() },
})
const otherSchema = new Schema({
	className: 'TypedOtherUltimaBaseArticle',
	fields: { name: stringField() },
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
	expectTypeOf(ultimabase.query(articleSchema)).toEqualTypeOf<
		UltimaBaseQuery<typeof articleSchema>
	>()
	expectTypeOf(
		ultimabase.application.getPlugin(databasePlugin.name),
	).toEqualTypeOf<{
		readonly dialect: 'fixture'
	}>()
	expectTypeOf(ultimabase.start()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(ultimabase.stop()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(ultimabase.dispose()).toEqualTypeOf<Promise<void>>()

	// @ts-expect-error -- Only exact schemas configured by this facade are queryable.
	ultimabase.query(otherSchema)
	new UltimaBase({
		schemas: [articleSchema],
		plugins: [databasePlugin],
		// @ts-expect-error -- Runtime assembly options remain closed and documented.
		unknown: true,
	})
})
