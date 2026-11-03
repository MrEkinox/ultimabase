// What GraphQL cannot take (D-227): an input object without a field. A model
// whose only fields are relations, or that has none, is served without one,
// as GraphQL requires.
import type { GraphQLInputType, GraphQLSchema } from 'graphql'
import { assertInputObjectType, getNamedType } from 'graphql'
import { defineModel } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from './index.ts'
import { asMaster, at, post, started } from './test/app.ts'

// A book is only its shelf; a tag only its articles; a ping has no field.
const Shelf = defineModel({
	name: 'Shelf',
	use: [graphql()],
	fields: (f) => ({ name: f.string(), books: f.many(() => Book) }),
})
const Book = defineModel({
	name: 'Book',
	use: [graphql()],
	fields: (f) => ({ shelf: f.one(() => Shelf) }),
})
const Article = defineModel({
	name: 'Article',
	use: [graphql()],
	fields: (f) => ({ title: f.string(), tags: f.many(() => Tag) }),
})
const Tag = defineModel({
	name: 'Tag',
	use: [graphql()],
	fields: (f) => ({ articles: f.many(() => Article) }),
})
const Ping = defineModel({ name: 'Ping', use: [graphql()], fields: () => ({}) })

let served: GraphQLSchema | undefined
/** Serves the generated schema as is, and keeps it. */
const extend = (schema: GraphQLSchema) => {
	served = schema
	return schema
}
let running: Awaited<ReturnType<typeof started>> | undefined
beforeAll(async () => {
	const models = [Shelf, Book, Article, Tag, Ping]
	running = await started({ extend }, undefined, [], [], models)
})
afterAll(async () => running?.app.stop())

const sent = async (query: string) =>
	post(`${running?.url ?? ''}/graphql`, query, {}, asMaster)

/** The fields of the input at `path` under a mutation's argument. */
function inputOf(mutation: string, ...path: readonly string[]) {
	const fields = served?.getMutationType()?.getFields()[mutation]
	let type: GraphQLInputType | undefined = fields?.args.find(
		({ name }) => name === path[0],
	)?.type
	for (const name of path.slice(1)) {
		type = assertInputObjectType(getNamedType(type)).getFields()[name]?.type
	}
	return Object.keys(assertInputObjectType(getNamedType(type)).getFields())
}

describe('a relation to a model with nothing else to write', () => {
	it('is only connected and disconnected', () => {
		expect(inputOf('createShelf', 'data', 'books')).toStrictEqual(['connect'])
		expect(inputOf('updateShelf', 'data', 'books')).toStrictEqual([
			'connect',
			'delete',
			'disconnect',
			'set',
		])
		expect(inputOf('createArticle', 'data', 'tags')).toStrictEqual(['connect'])
		expect(inputOf('updateArticle', 'data', 'tags')).toStrictEqual([
			'connect',
			'delete',
			'disconnect',
			'set',
		])
	})

	it('still takes its other side whole', () => {
		expect(inputOf('createBook', 'data', 'shelf')).toStrictEqual([
			'connect',
			'connectOrCreate',
			'create',
		])
	})

	it('connects a row', async () => {
		const shelf = await sent(
			`mutation { createShelf(data: { name: "a" }) { id } }`,
		)
		const id = String(at(shelf, 'data', 'createShelf', 'id'))
		const book = await sent(
			`mutation { createBook(data: { shelf: { connect: { id: "${id}" } } }) { shelf { name } } }`,
		)
		expect(book).toStrictEqual({
			data: { createBook: { shelf: { name: 'a' } } },
		})
	})
})

describe('a model without a field', () => {
	it('is created with no data, and neither updated nor upserted', async () => {
		const mutations = Object.keys(served?.getMutationType()?.getFields() ?? {})
		expect(mutations.filter((name) => name.endsWith('Ping'))).toStrictEqual([
			'createPing',
			'deletePing',
		])
		const created = await sent(`mutation { createPing { id } }`)
		expect(typeof at(created, 'data', 'createPing', 'id')).toBe('string')
	})
})
