import { UltimaBase, defineEnum } from '@ultimabase/core'
import {
	isEnumType,
	isNonNullType,
	isObjectType,
	type GraphQLType,
} from 'graphql'
import { describe, expect, it } from 'vitest'

import { initializeGraphqlTestApplication as createApplication } from './application.test-support.js'
import { graphqlPlugin, type GraphqlApplication } from './index.js'
import { graphqlFixtureDatabasePlugin } from './test-application.test-support.js'

const GraphqlEnumApplication = UltimaBase.use(graphqlPlugin())

const readFieldType = (
	graphql: GraphqlApplication,
	typeName: string,
	fieldName: string,
): GraphQLType | undefined => {
	const type = graphql.schema.getType(typeName)
	if (!isObjectType(type)) throw new TypeError(`Missing ${typeName}`)
	const fieldType = type.getFields()[fieldName]?.type
	return isNonNullType(fieldType) ? fieldType.ofType : fieldType
}

// ADR-0310: a shared enum names one GraphQL type; an array enum is local.
describe('GraphQL shared enums', () => {
	it('emits one enum type for every field using the same shared enum', async () => {
		const Priority = defineEnum('TaskPriority', ['low', 'medium', 'high'])
		const Task = GraphqlEnumApplication.Schema.define({
			className: 'GraphqlSharedEnumTask',
			fields: (field) => ({
				priority: field.enum({ required: true, values: Priority }),
				status: field.enum({ values: ['open', 'done'] }),
			}),
		}).with({ graphql: true })
		const Project = GraphqlEnumApplication.Schema.define({
			className: 'GraphqlSharedEnumProject',
			fields: (field) => ({
				defaultPriority: field.enum({ values: Priority }),
			}),
		}).with({ graphql: true })
		const application = await createApplication({
			logger: false,
			plugins: [graphqlPlugin({ default: true }), graphqlFixtureDatabasePlugin],
			schemas: [Task, Project],
		})
		const graphql = application.plugin('@ultimabase/graphql-plugin')

		const shared = graphql.schema.getType('TaskPriority')
		expect(isEnumType(shared)).toBe(true)
		expect(
			isEnumType(shared) ? shared.getValues().map(({ name }) => name) : [],
		).toStrictEqual(['low', 'medium', 'high'])
		expect(readFieldType(graphql, 'GraphqlSharedEnumTask', 'priority')).toBe(
			shared,
		)
		expect(
			readFieldType(graphql, 'GraphqlSharedEnumProject', 'defaultPriority'),
		).toBe(shared)
		const local = readFieldType(graphql, 'GraphqlSharedEnumTask', 'status')
		expect(isEnumType(local) ? local.name : undefined).toBe(
			'GraphqlSharedEnumTaskStatus',
		)
		await application.dispose()
	})
})
