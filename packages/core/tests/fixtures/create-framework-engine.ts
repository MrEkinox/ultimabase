import { plugin } from '../../src/plugin.js'

import type { DatabaseAdapter } from '../../src/runtime/database/contracts.js'
import { provideTestDatabaseAdapter } from '../runtime/fixtures/database-adapter-capability.js'
import { UltimaBase } from '../../src/runtime/application/ultima-base.js'

export const articleSchema = UltimaBase.Schema.define({
	className: 'AssembledArticle',
	fields: (field) => ({
		title: field.string({
			required: true,
		}),
	}),
})

export const databasePlugin = (adapter: DatabaseAdapter) =>
	plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.assembled-database',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})
