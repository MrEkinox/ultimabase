// Lists over GraphQL (D-120, D-127): `[String!]!` read, `[String!]` written
// and left out of create, filtered with `StringListFilter`, never sorted; a
// number list's elements are `Float!`, an enum list's its enum.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { printType } from 'graphql'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { graphql, graphqlPlugin } from './index.ts'
import { asMaster, post } from './test/app.ts'

const Article = defineModel({
	name: 'Article',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		tags: f.string({ list: true }),
		scores: f.number({ list: true }),
		sizes: f.enumOf(['S', 'M'], { list: true }),
	}),
}).with({ access: allow.readOnly })

let schema: GraphQLSchema | undefined
let url = ''
const lines: unknown[] = []
const logger: Logger = {
	info: (first) => {
		lines.push(first)
	},
	warn: () => {},
	error: () => {},
	child: () => logger,
}
const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin({ port: 0 }),
		graphqlPlugin({
			extend: (generated) => {
				schema = generated
				return generated
			},
		}),
	],
	models: [Article],
	masterKey: 'secret',
	logger,
})
beforeAll(async () => {
	await app.start()
	const line = lines.find(
		(first) => typeof first === 'string' && first.startsWith('Listening on'),
	)
	url = `${String(line).replace(/^Listening on (.*)\.$/, '$1')}/graphql`
})
afterAll(async () => app.stop())

const typeOf = (name: string): string => {
	const type = schema?.getType(name)
	return type === undefined ? 'none' : printType(type)
}

it('reads [String!]!, writes [String!] and leaves it out of create', () => {
	expect(typeOf('Article')).toContain('  tags: [String!]!\n')
	expect(typeOf('ArticleCreateInput')).toContain('  tags: [String!]\n')
	expect(typeOf('ArticleUpdateInput')).toContain('  tags: [String!]\n')
	expect(typeOf('StringListFilter')).toBe(
		'input StringListFilter {\n  has: String\n  hasSome: [String!]\n}',
	)
	expect(typeOf('ArticleWhereInput')).toContain('  tags: StringListFilter\n')
	expect(typeOf('ArticleOrderByInput')).not.toContain('tags')
})

it('types a number list by Float, an enum list by its enum', () => {
	expect(typeOf('Article')).toContain(
		'  scores: [Float!]!\n  sizes: [ArticleSizes!]!\n',
	)
	expect(typeOf('ArticleCreateInput')).toContain(
		'  scores: [Float!]\n  sizes: [ArticleSizes!]\n',
	)
	expect(typeOf('FloatListFilter')).toBe(
		'input FloatListFilter {\n  has: Float\n  hasSome: [Float!]\n}',
	)
	expect(typeOf('ArticleSizesListFilter')).toBe(
		'input ArticleSizesListFilter {\n  has: ArticleSizes\n  hasSome: [ArticleSizes!]\n}',
	)
	expect(typeOf('ArticleWhereInput')).toContain(
		'  scores: FloatListFilter\n  sizes: ArticleSizesListFilter\n',
	)
	expect(typeOf('ArticleOrderByInput')).not.toMatch(/scores|sizes/)
})

it('writes a list, [] when left out, and filters it', async () => {
	const created = await post(
		url,
		`mutation { a: createArticle(data: { title: "a", tags: ["ts", "go"], scores: [1.5, 2], sizes: [S, M] }) { tags scores sizes }
			b: createArticle(data: { title: "b" }) { tags scores sizes } }`,
		undefined,
		asMaster,
	)
	expect(created).toStrictEqual({
		data: {
			a: { tags: ['ts', 'go'], scores: [1.5, 2], sizes: ['S', 'M'] },
			b: { tags: [], scores: [], sizes: [] },
		},
	})
	const found = await post(
		url,
		`{ has: articles(first: 5, where: { tags: { has: "ts" } }) {
				edges { node { title } } }
			some: articles(first: 5, where: { NOT: { tags: { hasSome: ["go"] } } }) {
				edges { node { title } } }
			score: articles(first: 5, where: { scores: { has: 2 } }) {
				edges { node { title } } }
			size: articles(first: 5, where: { sizes: { hasSome: [M] } }) {
				edges { node { title } } } }`,
	)
	expect(found).toStrictEqual({
		data: {
			has: { edges: [{ node: { title: 'a' } }] },
			some: { edges: [{ node: { title: 'b' } }] },
			score: { edges: [{ node: { title: 'a' } }] },
			size: { edges: [{ node: { title: 'a' } }] },
		},
	})
})
