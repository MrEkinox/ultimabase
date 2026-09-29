import {
	plugin as createPlugin,
	contributeApplication,
} from '../../foundation.js'
import { Schema, type SchemaItem } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	type DatabaseAdapter,
	type UltimaBaseOptions,
	UltimaBase,
} from '../index.js'
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
const databasePlugin = createPlugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.typed-ultimabase-database',
	contributions: [
		provideTestDatabaseAdapter(adapter),
		contributeApplication(() => ({
			exports: { dialect: 'fixture' as const },
		})),
	],
})
const observerPlugin = createPlugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.typed-ultimabase-observer',
	contributions: [],
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
		ultimabase.plugin(databasePlugin.manifest.identity.pluginId),
	).toEqualTypeOf<{
		readonly dialect: 'fixture'
	}>()
	expectTypeOf(ultimabase.plugin(databasePlugin)).toEqualTypeOf<{
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

test('accumulates immutable configured factory tuples', () => {
	const DatabaseApplication = UltimaBase.use(databasePlugin)
	const CompleteApplication = DatabaseApplication.use(observerPlugin)
	const ConfiguredArticle = DatabaseApplication.Schema.define({
		className: 'TypedConfiguredArticle',
		fields: (field) => ({ title: field.string({ required: true }) }),
	})
	void ConfiguredArticle
	const databaseApplication = new DatabaseApplication({
		schemas: [articleSchema],
		validation: { timezone: 'Europe/Paris' },
	})
	const completeApplication = new CompleteApplication({
		schemas: [articleSchema],
	})
	const portableApplication = new UltimaBase({ schemas: [articleSchema] })

	expectTypeOf(DatabaseApplication.Schema).toEqualTypeOf<
		typeof UltimaBase.Schema
	>()
	expectTypeOf<SchemaItem<typeof ConfiguredArticle>['title']>().toBeString()
	expectTypeOf(databaseApplication).toEqualTypeOf<
		UltimaBase<
			readonly [typeof articleSchema],
			readonly [typeof databasePlugin]
		>
	>()
	expectTypeOf(completeApplication).toEqualTypeOf<
		UltimaBase<
			readonly [typeof articleSchema],
			readonly [typeof databasePlugin, typeof observerPlugin]
		>
	>()
	expectTypeOf(portableApplication).toEqualTypeOf<
		UltimaBase<readonly [typeof articleSchema]>
	>()
	expectTypeOf(databaseApplication.plugin(databasePlugin)).toEqualTypeOf<{
		readonly dialect: 'fixture'
	}>()

	new DatabaseApplication({
		schemas: [articleSchema],
		// @ts-expect-error -- A configured factory has no second plugin input.
		plugins: [observerPlugin],
	})

	const missingPlugins = { schemas: [articleSchema] as const }
	// @ts-expect-error -- The migration constructor cannot claim absent plugins.
	const invalidOptions: UltimaBaseOptions<
		readonly [typeof articleSchema],
		readonly [typeof databasePlugin]
	> = missingPlugins
	void invalidOptions
})
