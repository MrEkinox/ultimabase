// String lists over GraphQL (D-120): `[String!]!` read, `[String!]` written
// and left out of create, filtered with `StringListFilter`, never sorted.
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

it('writes a list, [] when left out, and filters it', async () => {
	const created = await post(
		url,
		`mutation { a: createArticle(data: { title: "a", tags: ["ts", "go"] }) { tags }
			b: createArticle(data: { title: "b" }) { tags } }`,
		undefined,
		asMaster,
	)
	expect(created).toStrictEqual({
		data: { a: { tags: ['ts', 'go'] }, b: { tags: [] } },
	})
	const found = await post(
		url,
		`{ has: articles(first: 5, where: { tags: { has: "ts" } }) {
				edges { node { title } } }
			some: articles(first: 5, where: { NOT: { tags: { hasSome: ["go"] } } }) {
				edges { node { title } } } }`,
	)
	expect(found).toStrictEqual({
		data: {
			has: { edges: [{ node: { title: 'a' } }] },
			some: { edges: [{ node: { title: 'b' } }] },
		},
	})
})
