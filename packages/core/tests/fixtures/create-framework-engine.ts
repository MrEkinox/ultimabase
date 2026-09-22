import { definePlugin } from '../../src/foundation.js'
import { Schema } from '../../src/schema/index.js'
import type { DatabaseAdapter } from '../../src/runtime/database/contracts.js'
import { provideTestDatabaseAdapter } from '../runtime/fixtures/database-adapter-capability.js'

export const articleSchema = Schema.define({
	className: 'AssembledArticle',
	fields: (field) => ({
		title: field.string({
			required: true,
		}),
	}),
})

export const databasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.assembled-database',
		capabilities: {
			provides: [provideTestDatabaseAdapter(adapter)],
		},
	})
