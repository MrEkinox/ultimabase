import { Schema } from '@ultimabase/core'
import { isEnumType, isInputObjectType, isObjectType } from 'graphql'
import { describe, expect, it } from 'vitest'

import { graphqlPlugin, type GraphqlSchemaExposureOption } from './index.js'
import { initializeGraphqlTestApplication as createApplication } from './application.test-support.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}

const readSchema = async (
	schemas: readonly ReturnType<typeof Schema.define>[],
	plugin = graphqlPlugin(),
) => {
	const application = await createApplication({
		pluginPrivileges: { logger: false },
		plugins: [plugin],
		schemas,
	})
	return {
		application,
		schema: application.plugin('@ultimabase/graphql-plugin').schema,
	}
}

describe('GraphQL read input compilation', () => {
	it('generates enabled roots, exact field operators, ordering, and relation arguments', async () => {
		const Author = Schema.define({
			className: 'ReadInputAuthor',
			fields: (field) => ({ name: field.string() }),
		})
		const Post = Schema.define({
			className: 'ReadInputPost',
			fields: (field) => ({
				author: field.pointer({ target: 'ReadInputAuthor' }),
				metadata: field.json(),
				payload: field.object({
					fields: (nested) => ({ count: nested.int() }),
				}),
				related: field.relation({ target: 'ReadInputAuthor' }),
				tags: field.string({ list: true }),
				title: field.string(),
			}),
			graphql: { operations: { count: true } },
		})
		const { application, schema } = await readSchema([Author, Post])
		const query = schema.getQueryType()?.getFields()

		expect(Object.keys(query ?? {})).toEqual(
			expect.arrayContaining([
				'getReadInputPost',
				'findOneReadInputPost',
				'findManyReadInputPost',
				'countReadInputPost',
				'existsReadInputPost',
			]),
		)
		expect(query?.findManyReadInputPost?.args.map(({ name }) => name)).toEqual([
			'after',
			'first',
			'orderBy',
			'where',
		])
		expect(
			query?.findManyReadInputPost?.args.find(({ name }) => name === 'first')
				?.default?.value,
		).toBe(25)

		const where = schema.getType('ReadInputPostWhere')
		const title = schema.getType('ReadInputPostTitleWhere')
		const tags = schema.getType('ReadInputPostTagsWhere')
		const author = schema.getType('ReadInputPostAuthorWhere')
		const related = schema.getType('ReadInputPostRelatedWhere')
		const orderField = schema.getType('ReadInputPostOrderField')
		const relation = schema.getType('ReadInputPost')

		expect(isInputObjectType(where)).toBe(true)
		expect(isInputObjectType(title)).toBe(true)
		expect(isInputObjectType(tags)).toBe(true)
		expect(isInputObjectType(author)).toBe(true)
		expect(isInputObjectType(related)).toBe(true)
		expect(isEnumType(orderField)).toBe(true)
		if (
			!isInputObjectType(title) ||
			!isInputObjectType(tags) ||
			!isInputObjectType(author) ||
			!isInputObjectType(related) ||
			!isEnumType(orderField) ||
			!isObjectType(relation)
		) {
			throw new TypeError('Expected generated GraphQL read types')
		}

		expect(Object.keys(title.getFields())).toEqual(
			expect.arrayContaining([
				'eq',
				'between',
				'contains',
				'matches',
				'isNotNull',
			]),
		)
		expect(Object.keys(tags.getFields()).sort()).toEqual(
			[
				'eq',
				'has',
				'hasEvery',
				'hasSome',
				'isEmpty',
				'isNotNull',
				'isNull',
				'ne',
			].sort(),
		)
		expect(Object.keys(author.getFields())).toEqual(
			expect.arrayContaining(['eq', 'is', 'isNot', 'isNull']),
		)
		expect(Object.keys(related.getFields())).toEqual(
			expect.arrayContaining([
				'count',
				'every',
				'isEmpty',
				'isNotEmpty',
				'none',
				'some',
			]),
		)
		expect(orderField.getValues().map(({ name }) => name)).toContain('title')
		expect(relation.getFields().related?.args.map(({ name }) => name)).toEqual([
			'after',
			'first',
			'orderBy',
			'where',
		])
		await application.dispose()
	})

	it('uses the configured default page size on roots and relations', async () => {
		const Child = Schema.define({
			className: 'ConfiguredReadChild',
			fields: (field) => ({ value: field.string() }),
		})
		const Parent = Schema.define({
			className: 'ConfiguredReadParent',
			fields: (field) => ({
				children: field.relation({ target: 'ConfiguredReadChild' }),
			}),
			graphql: true,
		})
		const { application, schema } = await readSchema(
			[Child, Parent],
			graphqlPlugin({ limits: { defaultPageSize: 7, maxPageSize: 20 } }),
		)
		const root = schema.getQueryType()?.getFields().findManyConfiguredReadParent
		const parent = schema.getType('ConfiguredReadParent')
		if (!isObjectType(parent)) {
			throw new TypeError('Expected configured parent type')
		}

		expect(
			root?.args.find(({ name }) => name === 'first')?.default?.value,
		).toBe(7)
		expect(
			parent.getFields().children?.args.find(({ name }) => name === 'first')
				?.default?.value,
		).toBe(7)
		await application.dispose()
	})

	it('omits disabled read roots without changing supporting model types', async () => {
		const HiddenReads = Schema.define({
			className: 'HiddenReads',
			fields: (field) => ({ value: field.string() }),
			graphql: {
				operations: {
					count: true,
					exists: false,
					findMany: false,
					findOne: false,
					get: false,
				},
			},
		})
		const { application, schema } = await readSchema([HiddenReads])
		const query = schema.getQueryType()?.getFields()

		expect(Object.keys(query ?? {})).toStrictEqual(['countHiddenReads'])
		expect(schema.getType('HiddenReads')).toBeDefined()
		await application.dispose()
	})
})
