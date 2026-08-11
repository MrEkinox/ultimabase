import { definePlugin, type FrameworkApplication } from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import { createFrameworkEngine } from './create-framework-engine.js'

const schema = Schema.define({
	className: 'AssembledTypedArticle',
	fields: (field) => ({ title: field.string() }),
})
declare const adapter: DatabaseAdapter
const databasePlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.assembled-database',
	setup: ({ services }) => {
		// The declaration fixture only needs to retain the plugin tuple relationship.
		services.provide(databaseAdapterServiceToken, adapter)
	},
})

declare const application: FrameworkApplication<
	readonly [typeof schema],
	readonly [typeof databasePlugin]
>

test('preserves exact application tuples through public engine assembly', () => {
	const framework = createFrameworkEngine(application)

	expectTypeOf(schema.className).toEqualTypeOf<'AssembledTypedArticle'>()
	expectTypeOf(
		databasePlugin.manifest.identity.pluginId,
	).toEqualTypeOf<'fixture.assembled-database'>()
	expectTypeOf(framework).toEqualTypeOf<
		FrameworkEngine<readonly [typeof schema], readonly [typeof databasePlugin]>
	>()
	expectTypeOf(framework.application).toEqualTypeOf<typeof application>()
})
