/* global process */

import {
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	provideCapability,
} from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphql } from 'graphql'

const Note = Schema.define({
	className: 'JavaScriptGraphqlNote',
	fields: (field) => ({ title: field.string() }),
	graphql: true,
})

const row = {
	id: '01991f00-0000-7000-8000-000000000612',
	title: 'Typegen-free GraphQL',
}

const adapter = {
	capabilities: { persistencePlans: databasePersistencePlanCapability },
	kind: 'database-adapter',
	beginTransaction: () => {
		throw new TypeError('JavaScript GraphQL fixture does not mutate')
	},
	execute: (request) =>
		Promise.resolve(request.operation.kind === 'find-many' ? [row] : row),
}

const databasePlugin = definePlugin({
	capabilities: {
		provides: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: adapter }),
			}),
		],
	},
	core: '^0.0.0',
	pluginId: 'fixture.javascript-graphql-database',
	version: '1.0.0',
})

const ultimabase = new UltimaBase({
	pluginPrivileges: { logger: false },
	plugins: [
		databasePlugin,
		graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
	],
	schemas: [Note],
})

await ultimabase.start()
const context = ultimabase.engine.anonymous({
	requestId: 'javascript-graphql-request',
	source: 'ultimabase.graphql',
}).context
const graphqlApplication = ultimabase.application.getPlugin(
	'@ultimabase/graphql-plugin',
)
const result = await graphql({
	contextValue: { request: context },
	schema: graphqlApplication.schema,
	source: `query {
		findManyJavaScriptGraphqlNote(first: 1) {
			nodes { id title }
			pageInfo { hasNextPage }
		}
	}`,
})

process.stdout.write(JSON.stringify(result))
await ultimabase.dispose()
