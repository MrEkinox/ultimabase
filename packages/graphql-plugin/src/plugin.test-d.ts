import { UltimaBase } from '@ultimabase/core'
import { defineOperation, defineOperationValue } from '@ultimabase/core/plugin'
import type { ExecutionResult } from 'graphql'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { expectTypeOf, test } from 'vitest'

import {
	graphqlOperationProtocol,
	graphqlPlugin,
	graphqlProtocol,
	graphqlSchemaContributionsCapability,
	provideGraphqlSchemas,
	type GraphqlExecuteOptions,
	type GraphqlMethodRules,
	type GraphqlPlugin,
	type GraphqlPluginExports,
	type GraphqlSchemaRule,
	type GraphqlTypeNameRule,
} from './index.js'

const operationValue = defineOperationValue((value: unknown): null => {
	if (value !== null) throw new TypeError('Expected null')
	return null
})
const applicationOperation = defineOperation({
	input: operationValue,
	name: 'fixture.graphql.typed-operation',
	result: operationValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

test('preserves plugin and configured schema option types', async () => {
	const configured = graphqlPlugin({ default: { count: true } })
	const App = UltimaBase.use(configured)
	const Post = App.Schema.define({
		className: 'Post',
		fields: (field) => ({ title: field.string({ required: true }) }),
	}).with((plugins) =>
		plugins
			// The keys are the schema method names (ADR-0325).
			.graphql({
				createMany: true,
				findOne: true,
				typeName: 'Article',
				upsertOne: false,
			}),
	)
	App.Schema.define({
		className: 'Hidden',
		fields: () => ({}),
	}).with((plugins) =>
		plugins.graphql({
			// @ts-expect-error -- `operations` and `get` are gone (ADR-0325).
			operations: { get: true },
		}),
	)
	const limited = graphqlPlugin({
		limits: { maxDepth: 10 },
		pagination: { defaultTake: 10, maxTake: 50 },
	})
	const withOperation = graphqlPlugin({
		hide: [applicationOperation],
		publicWrites: true,
		sdl: './schema.graphql',
	})
	const customSchema = new GraphQLSchema({
		query: new GraphQLObjectType({
			name: 'Query',
			fields: { ping: { type: GraphQLString } },
		}),
	})
	const withSchema = graphqlPlugin({ schemas: [customSchema] })
	const schemaProvider = provideGraphqlSchemas({
		contributionId: 'typed-schema',
		create: ({ schemas }) => {
			expectTypeOf(schemas).not.toBeAny()
			return customSchema
		},
	})
	const application = await new App({
		schemas: [Post],
	}).initialize()
	const exports = application.plugin('@ultimabase/graphql-plugin')

	expectTypeOf(configured).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(limited).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(withOperation).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(withSchema).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(schemaProvider.token).toEqualTypeOf(
		graphqlSchemaContributionsCapability,
	)
	expectTypeOf(exports).toExtend<Readonly<GraphqlPluginExports>>()
	expectTypeOf(exports.schema).toEqualTypeOf<GraphQLSchema>()
	expectTypeOf<GraphqlSchemaRule>().toEqualTypeOf<
		boolean | (GraphqlMethodRules & GraphqlTypeNameRule)
	>()
	expectTypeOf<
		Parameters<typeof exports.execute>[0]
	>().toEqualTypeOf<GraphqlExecuteOptions>()
	expectTypeOf<ReturnType<typeof exports.execute>>().toEqualTypeOf<
		Promise<ExecutionResult>
	>()
	expectTypeOf(graphqlProtocol.name).toEqualTypeOf<'ultimabase.graphql'>()
	expectTypeOf(graphqlProtocol.version).toEqualTypeOf<'1.0.0'>()
	expectTypeOf(
		graphqlOperationProtocol.name,
	).toEqualTypeOf<'ultimabase.graphql.operation'>()
	expectTypeOf(graphqlOperationProtocol.version).toEqualTypeOf<'1.0.0'>()
})

test('rejects invalid connection limit types', () => {
	graphqlPlugin({
		pagination: {
			// @ts-expect-error page sizes are numeric
			defaultTake: 'ten',
		},
	})
	graphqlPlugin({
		limits: {
			// @ts-expect-error page sizes moved to pagination
			defaultPageSize: 10,
		},
	})
	graphqlPlugin({
		limits: {
			// @ts-expect-error unknown limit keys are rejected
			unknown: 10,
		},
	})
	graphqlPlugin({
		// @ts-expect-error hiding accepts application operations only
		hide: [{ ...applicationOperation, target: 'schema' }],
	})
	graphqlPlugin({
		// @ts-expect-error owners declare public operations (ADR-0325)
		operations: [applicationOperation],
	})
	graphqlPlugin({
		// @ts-expect-error ADR-0294 replaced the acknowledgement by publicWrites
		acknowledgeUnverifiedProtection: true,
	})
	graphqlPlugin({
		default: {
			// @ts-expect-error the keys are the schema method names (ADR-0325)
			get: true,
		},
	})
})
