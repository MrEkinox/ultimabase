// How models' `.with({ graphql })` shape the schema (D-107): a plural, a
// model reached by relations only, a ruled relation, and the schemas refused.
import { httpPlugin } from '@ultimabase/http'
import type { Logger } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	master,
	memory,
} from 'ultimabase'
import { expect, it } from 'vitest'
import { graphql, graphqlPlugin } from './index.ts'
import { asMaster, at, post } from './test/app.ts'

const Tag = defineModel({
	name: 'Tag',
	use: [graphql()],
	fields: (f) => ({
		label: f.string(),
		owner: f.one(() => Person, { inverse: 'tags' }),
		watcher: f.one(() => Person, { inverse: 'hidden', optional: true }),
	}),
}).with({ access: allow.readOnly, graphql: false })

const Person = defineModel({
	name: 'Person',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		tags: f.many(() => Tag, { inverse: 'owner' }),
		hidden: f
			.many(() => Tag, { inverse: 'watcher' })
			.with({ access: { read: () => false } }),
	}),
}).with({ access: allow.readOnly, graphql: { plural: 'people' } })

const Team = defineModel({
	name: 'Team',
	use: [graphql()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		code: f.string({ unique: true }).with({ access: { read: allow.private } }),
	}),
	indexes: [{ fields: ['name', 'code'], unique: true }],
}).with({ access: allow.readOnly })

async function listening(
	models: Parameters<typeof defineApp>[0]['models'],
	functions: Parameters<typeof defineApp>[0]['functions'] = [],
) {
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
		plugins: [httpPlugin({ port: 0 }), graphqlPlugin()],
		models,
		functions,
		masterKey: 'secret',
		logger,
	})
	await app.start()
	const line = lines.find(
		(first) => typeof first === 'string' && first.startsWith('Listening on'),
	)
	return { app, url: String(line).replace(/^Listening on (.*)\.$/, '$1') }
}

it('names a list after its plural and reaches a hidden model by relations', async () => {
	const { app, url } = await listening([Person, Tag])
	try {
		const ada = await Person.create({ data: { name: 'ada' } }, { as: master })
		const tag = await Tag.create(
			{
				data: {
					label: 'math',
					owner: { connect: { id: ada.id } },
					watcher: { connect: { id: ada.id } },
				},
			},
			{ as: master },
		)
		const result = await post(
			`${url}/graphql`,
			`{ people(first: 10) { edges { node {
				name tags { edges { node { label } } } hidden { pageInfo { hasNextPage } }
			} } } }`,
		)
		expect(at(result.data, 'people', 'edges', 0, 'node')).toStrictEqual({
			name: 'ada',
			tags: { edges: [{ node: { label: 'math' } }] },
			hidden: null,
		})
		const tags = await post(`${url}/graphql`, `{ tags { totalCount } }`)
		expect(tags.errors?.[0]?.message).toContain('tags')
		const deleted = await post(
			`${url}/graphql`,
			`mutation { deleteTag(where: { id: "${tag.id}" }) { id } }`,
			undefined,
			asMaster,
		)
		expect(deleted.errors?.[0]?.message).toContain('deleteTag')
	} finally {
		await app.stop()
	}
})

it('creates, updates or deletes no row of a hidden model through a relation (D-138)', async () => {
	const { app, url } = await listening([Person, Tag])
	try {
		const types = await post(
			`${url}/graphql`,
			`{
				nested: __type(name: "TagCreateNestedManyWithoutOwnerInput") { inputFields { name } }
				updated: __type(name: "TagUpdateManyWithoutOwnerNestedInput") { inputFields { name } }
				row: __type(name: "TagCreateWithoutOwnerInput") { name }
				orCreate: __type(name: "TagCreateOrConnectWithoutOwnerInput") { name }
			}`,
		)
		expect(types.data).toStrictEqual({
			nested: { inputFields: [{ name: 'connect' }] },
			updated: {
				inputFields: [
					{ name: 'connect' },
					{ name: 'disconnect' },
					{ name: 'set' },
				],
			},
			row: null,
			orCreate: null,
		})
		const created = await post(
			`${url}/graphql`,
			`mutation { createPerson(data: {
				name: "bo", tags: { create: [{ label: "x" }] }
			}) { name } }`,
			undefined,
			asMaster,
		)
		expect(created.errors?.[0]?.message).toContain('"create"')
		expect(await Tag.count({}, { as: master })).toBe(0)
	} finally {
		await app.stop()
	}
})

it('leaves a unique field only Master reads out of the unique input', async () => {
	const { app, url } = await listening([Team])
	try {
		const result = await post(
			`${url}/graphql`,
			`{ __type(name: "TeamWhereUniqueInput") { inputFields { name } } }`,
		)
		expect(at(result.data, '__type', 'inputFields')).toStrictEqual([
			{ name: 'id' },
			{ name: 'name' },
		])
	} finally {
		await app.stop()
	}
})

it('disconnects rows of a many relation', async () => {
	const { app, url } = await listening([Person, Tag])
	try {
		const ada = await Person.create({ data: { name: 'ada' } }, { as: master })
		const tag = await Tag.create(
			{
				data: {
					label: 'math',
					owner: { connect: { id: ada.id } },
					watcher: { connect: { id: ada.id } },
				},
			},
			{ as: master },
		)
		const result = await post(
			`${url}/graphql`,
			`mutation ($ada: ID!, $tag: ID!) { updatePerson(
				where: { id: $ada },
				data: { name: "ada l.", hidden: { disconnect: [{ id: $tag }] } }
			) { name } }`,
			{ ada: ada.id, tag: tag.id },
			asMaster,
		)
		expect(result).toStrictEqual({
			data: { updatePerson: { name: 'ada l.' } },
		})
		const after = await Tag.findUnique(
			{ where: { id: tag.id }, include: { watcher: true } },
			{ as: master },
		)
		expect(after?.watcher).toBeNull()
	} finally {
		await app.stop()
	}
})

it('refuses two models with the same root field', async () => {
	const Posts = defineModel({
		name: 'Posts',
		use: [graphql()],
		fields: (f) => ({ title: f.string() }),
	})
	const Post = defineModel({
		name: 'Post',
		use: [graphql()],
		fields: (f) => ({ title: f.string() }),
	})
	await expect(listening([Post, Posts])).rejects.toThrow(
		"Posts: the root field posts is Post's; set .with({ graphql: { plural } }).",
	)
})

const Draft = defineModel({
	name: 'Draft',
	use: [graphql()],
	fields: (f) => ({ text: f.string() }),
}).with({ graphql: false })

it('serves a query function without a model, and no Mutation (D-109)', async () => {
	const now = defineFunction({ name: 'now', query: true, run: () => undefined })
	const { app, url } = await listening(
		[Draft],
		[now.with({ access: allow.public })],
	)
	try {
		expect(
			await post(
				`${url}/graphql`,
				'{ now __schema { mutationType { name } } }',
			),
		).toEqual({ data: { now: true, __schema: { mutationType: null } } })
	} finally {
		await app.stop()
	}
})

it('refuses a schema without a model', async () => {
	await expect(listening([Draft])).rejects.toThrow(
		'graphqlPlugin: no query to expose; each model has .with({ graphql: false }) and no function is a query.',
	)
})

it("refuses a schema without the application's models, a plugin's being never exposed", async () => {
	await expect(listening([])).rejects.toThrow(
		"graphqlPlugin: no query to expose; the application lists no model, a plugin's own models are never exposed, and no function is a query.",
	)
})
