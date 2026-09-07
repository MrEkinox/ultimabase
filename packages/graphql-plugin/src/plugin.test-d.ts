import { Schema, createApplication } from '@ultimabase/core'
import type { GraphQLSchema } from 'graphql'
import { expectTypeOf, test } from 'vitest'

import {
	graphqlPlugin,
	graphqlProtocol,
	type GraphqlPlugin,
	type GraphqlPluginExports,
	type GraphqlSchemaExposureOption,
} from './index.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}

test('preserves plugin and generated schema option types', async () => {
	const Post = Schema.define({
		className: 'Post',
		fields: (field) => ({ title: field.string({ required: true }) }),
		graphql: {
			operations: { bulk: { create: true }, get: true, upsert: false },
			typeName: 'Article',
		},
	})
	const configured = graphqlPlugin({ default: { count: true } })
	const limited = graphqlPlugin({
		limits: { defaultPageSize: 10, maxPageSize: 50 },
	})
	const application = await createApplication({
		plugins: [configured],
		schemas: [Post],
	})
	const exports = application.getPlugin('@ultimabase/graphql-plugin')

	expectTypeOf(configured).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(limited).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(exports).toEqualTypeOf<Readonly<GraphqlPluginExports>>()
	expectTypeOf(exports.schema).toEqualTypeOf<GraphQLSchema>()
	expectTypeOf(graphqlProtocol.name).toEqualTypeOf<'ultimabase.graphql'>()
	expectTypeOf(graphqlProtocol.version).toEqualTypeOf<'1.0.0'>()
})

test('rejects invalid connection limit types', () => {
	graphqlPlugin({
		limits: {
			// @ts-expect-error page sizes are numeric
			defaultPageSize: 'ten',
		},
	})
	graphqlPlugin({
		limits: {
			// @ts-expect-error unknown limit keys are rejected
			unknown: 10,
		},
	})
})
