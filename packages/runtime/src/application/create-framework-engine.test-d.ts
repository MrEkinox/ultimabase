import { definePlugin, type FrameworkApplication } from '@ultimabase/core'
import { Schema, stringField } from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import { createFrameworkEngine } from './create-framework-engine.js'

const schema = new Schema({
	className: 'AssembledTypedArticle',
	fields: { title: stringField() },
})
declare const adapter: DatabaseAdapter
const databasePlugin = definePlugin({
	name: 'fixture.assembled-database',
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
		databasePlugin.name,
	).toEqualTypeOf<'fixture.assembled-database'>()
	expectTypeOf(framework).toEqualTypeOf<
		FrameworkEngine<readonly [typeof schema], readonly [typeof databasePlugin]>
	>()
	expectTypeOf(framework.application).toEqualTypeOf<typeof application>()
})
