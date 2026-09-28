import { plugin } from '../../foundation.js'
import type { FrameworkApplication } from '../../application/framework-application.js'
import { Schema } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import type { DatabaseAdapter } from '../database/contracts.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import { createFrameworkEngine } from './create-framework-engine.js'

const schema = Schema.define({
	className: 'AssembledTypedArticle',
	fields: (field) => ({ title: field.string() }),
})
declare const adapter: DatabaseAdapter
const databasePlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.assembled-database',
	contributions: [provideTestDatabaseAdapter(adapter)],
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
