import {
	plugin as createPlugin,
	contributeApplication,
	type PluginDefinition,
} from '../../foundation.js'
import { type SchemaItem } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import { type DatabaseAdapter, UltimaBase } from '../index.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import type { QueryResult } from '../../query/index.js'

const articleSchema = UltimaBase.Schema.define({
	className: 'TypedUltimaBaseArticle',
	fields: (field) => ({ title: field.string() }),
})
const otherSchema = UltimaBase.Schema.define({
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
	const ultimabase = new (UltimaBase.use(databasePlugin))({
		schemas: [articleSchema],
		validation: { timezone: 'Europe/Paris' },
	})

	expectTypeOf(ultimabase).toEqualTypeOf<
		UltimaBase<
			readonly [typeof articleSchema],
			readonly [typeof databasePlugin]
		>
	>()
	expectTypeOf(articleSchema.findMany(undefined)).toEqualTypeOf<
		Promise<readonly QueryResult<typeof articleSchema>[]>
	>()
	// @ts-expect-error -- Operations resolve the sole active application.
	void articleSchema.findMany(undefined, { ultimabase })
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
	void otherSchema.findMany(undefined)
	new (UltimaBase.use(databasePlugin))({
		schemas: [articleSchema],
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
	const fixedPlugins = [databasePlugin, observerPlugin] as const
	const VariadicApplication = UltimaBase.use(...fixedPlugins)
	const variadicApplication = new VariadicApplication({
		schemas: [articleSchema],
	})
	const dynamicPlugins: readonly PluginDefinition[] = fixedPlugins
	const DynamicApplication = UltimaBase.use(...dynamicPlugins)
	void new DynamicApplication({ schemas: [articleSchema] })
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
	expectTypeOf(variadicApplication).toEqualTypeOf<
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

	new UltimaBase<
		readonly [typeof articleSchema],
		readonly [typeof databasePlugin]
	>(
		// @ts-expect-error -- Explicit generic arguments cannot invent installed plugins.
		{ schemas: [articleSchema] },
	)
	new UltimaBase({
		schemas: [articleSchema],
		// @ts-expect-error -- The root constructor cannot install plugins.
		plugins: [databasePlugin],
	})
})
