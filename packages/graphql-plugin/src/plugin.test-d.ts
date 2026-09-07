import {
	Schema,
	createApplication,
	defineOperation,
	defineOperationValue,
} from '@ultimabase/core'
import type { GraphQLSchema } from 'graphql'
import { expectTypeOf, test } from 'vitest'

import {
	graphqlPlugin,
	graphqlOperationProtocol,
	graphqlProtocol,
	type GraphqlPlugin,
	type GraphqlPluginExports,
	type GraphqlSchemaExposureOption,
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
const schemaOperation = defineOperation({
	input: operationValue,
	name: 'fixture.graphql.typed-schema-operation',
	result: operationValue,
	target: 'schema',
	transaction: 'forbidden',
	version: '1.0.0',
})

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
	const withOperation = graphqlPlugin({ operations: [applicationOperation] })
	const application = await createApplication({
		plugins: [configured],
		schemas: [Post],
	})
	const exports = application.getPlugin('@ultimabase/graphql-plugin')

	expectTypeOf(configured).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(limited).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(withOperation).toEqualTypeOf<GraphqlPlugin>()
	expectTypeOf(exports).toEqualTypeOf<Readonly<GraphqlPluginExports>>()
	expectTypeOf(exports.schema).toEqualTypeOf<GraphQLSchema>()
	expectTypeOf(graphqlProtocol.name).toEqualTypeOf<'ultimabase.graphql'>()
	expectTypeOf(graphqlProtocol.version).toEqualTypeOf<'1.0.0'>()
	expectTypeOf(
		graphqlOperationProtocol.name,
	).toEqualTypeOf<'ultimabase.graphql.operation'>()
	expectTypeOf(graphqlOperationProtocol.version).toEqualTypeOf<'1.0.0'>()
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
	graphqlPlugin({
		// @ts-expect-error GraphQL custom roots accept application operations only
		operations: [schemaOperation],
	})
})
