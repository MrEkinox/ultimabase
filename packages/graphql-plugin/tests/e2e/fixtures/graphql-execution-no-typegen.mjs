/* global process */

import {
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePointerCapability,
	databasePersistencePlanCapability,
	plugin,
	provideCapability,
} from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphql } from 'graphql'

const Target = Schema.define({
	className: 'JavaScriptGraphqlTarget',
	fields: (field) => ({ score: field.bigint() }),
	graphql: true,
})

const Note = Schema.define({
	className: 'JavaScriptGraphqlNote',
	fields: (field) => ({
		primary: field.pointer({ target: 'JavaScriptGraphqlTarget' }),
		title: field.string(),
		summary: field.virtual({
			output: (output) =>
				output.object({
					fields: (nested) => ({
						binary: nested.binary({ nullable: false }),
						huge: nested.bigint({ nullable: false }),
						label: nested.string({ nullable: false }),
					}),
					nullable: false,
				}),
			resolve: async ({ item }) => {
				await Promise.resolve()
				return {
					binary: Uint8Array.from([1, 2, 3]),
					huge: 9_007_199_254_740_993n,
					label: String(item.title).toUpperCase(),
				}
			},
			select: { title: true },
		}),
	}),
	graphql: true,
})

const row = {
	id: '01991f00-0000-7000-8000-000000000612',
	title: 'Typegen-free GraphQL',
}
const writes = []

const adapter = {
	capabilities: {
		persistencePlans: databasePersistencePlanCapability,
		pointers: databasePointerCapability,
	},
	kind: 'database-adapter',
	beginTransaction: () => {
		throw new TypeError('JavaScript GraphQL fixture does not persist mutations')
	},
	execute: (request) =>
		Promise.resolve(request.operation.kind === 'find-many' ? [row] : row),
}

const databasePlugin = plugin({
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: adapter }),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.javascript-graphql-database',
	version: '1.0.0',
})

const Application = UltimaBase.use(
	databasePlugin,
	graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
)
const ultimabase = new Application({
	pluginPrivileges: { logger: false },
	schemas: [Target, Note],
})

await ultimabase.start()
const context = ultimabase.anonymous({
	requestId: 'javascript-graphql-request',
	source: 'ultimabase.graphql',
}).context
const graphqlApplication = ultimabase.plugin('@ultimabase/graphql-plugin')
graphqlApplication.schema
	.getMutationType()
	.getFields().createJavaScriptGraphqlNote.resolve = (_source, args) => {
	writes.push({ score: String(args.input.primary.create.score) })
	return { id: '01991f00-0000-7000-8000-000000000613' }
}
const query = await graphql({
	contextValue: { request: context },
	schema: graphqlApplication.schema,
	source: `query {
		findManyJavaScriptGraphqlNote(first: 1) {
			nodes { id title summary { binary huge label } }
			pageInfo { hasNextPage }
		}
	}`,
})

const mutation = await graphql({
	contextValue: { request: context },
	schema: graphqlApplication.schema,
	source: `mutation {
		createJavaScriptGraphqlNote(input: {
			primary: { create: { score: "7" } }
			title: "Nested Typegen-free GraphQL"
		}) { id }
	}`,
})

process.stdout.write(JSON.stringify({ mutation, query, writes }))
await ultimabase.dispose()
