// Virtual fields over GraphQL (D-151): an output field of its model's type,
// an argument per input property, a model's rows selected like a relation's,
// counted by the row budget.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { isObjectType, printType } from 'graphql'
import { z } from 'zod'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	defineType,
	master,
	memory,
} from 'ultimabase'
import type { Logger } from 'ultimabase'
import { afterEach, describe, expect, it } from 'vitest'
import { graphql, graphqlPlugin } from './index.ts'
import type { GraphqlOptions } from './index.ts'
import { at, post } from './test/app.ts'

const M = { as: master }

const Summary = defineType({
	name: 'Summary',
	fields: { count: z.int() },
})

const Stage = defineModel({
	name: 'Stage',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		secret: f.string().with({ access: { read: allow.private } }),
		images: f.many(() => Image),
		label: f.virtual(z.string(), {
			needs: ['name'],
			description: 'Its name, loud.',
		}),
		thumb: f.virtual(z.string(), {
			input: z.object({ size: z.int().positive() }),
			needs: ['name'],
		}),
		leak: f.virtual(z.string(), { needs: ['secret'] }),
		maps: f.virtual(() => [Image], {
			input: z.object({ first: z.int().optional() }),
		}),
		summary: f.virtual(() => Summary),
	}),
}).with({
	access: allow.public,
	virtuals: {
		label: { run: ({ record }) => record.name.toUpperCase() },
		thumb: { run: ({ input, record }) => `${record.name}@${input.size}` },
		leak: { run: ({ record }) => record.secret },
		maps: {
			runMany: async ({ input, records }) => {
				const images = await Image.findMany(
					{
						orderBy: { url: 'asc' },
						include: { stage: { select: { id: true } } },
					},
					M,
				)
				return records.map((record) =>
					images
						.filter((image) => image.stage?.id === record.id)
						.slice(0, input.first),
				)
			},
		},
		summary: { run: () => ({ count: 2 }) },
	},
})

const Image = defineModel({
	name: 'Image',
	use: [graphql()],
	fields: (f) => ({
		url: f.string(),
		stage: f.one(() => Stage, { optional: true }),
	}),
}).with({ access: allow.public })

const firstStage = defineFunction({
	name: 'firstStage',
	query: true,
	output: Stage,
	run: async () => {
		const found = await Stage.findFirst({ orderBy: { name: 'asc' } }, M)
		if (found === null) throw new Error('No stage.')
		return found
	},
}).with({ access: allow.public })

const quiet: Logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => quiet,
}

const threeWith = (field: string) =>
	`{ stages(first: 3) { edges { node { name ${field} } } } }`

let app: ReturnType<typeof defineApp> | undefined
afterEach(async () => {
	await app?.stop()
	app = undefined
})

/** The application, two stages and three images; returns its URL. */
async function started(options: GraphqlOptions = {}) {
	let schema: GraphQLSchema | undefined
	let url = ''
	const errors: unknown[] = []
	const logger: Logger = {
		...quiet,
		info: (first: unknown) => {
			const found = /^Listening on (.*)\.$/.exec(String(first))
			if (found?.[1] !== undefined) url = `${found[1]}/graphql`
		},
		error: (first: unknown) => {
			errors.push(Reflect.get(Object(first), 'err'))
		},
		child: () => logger,
	}
	app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			graphqlPlugin({
				...options,
				extend: (generated) => {
					schema = generated
					return generated
				},
			}),
		],
		models: [Stage, Image],
		functions: [firstStage],
		logger,
	})
	await app.start()
	const one = await Stage.create({ data: { name: 'one', secret: 's' } }, M)
	await Stage.create({ data: { name: 'two', secret: 's' } }, M)
	for (const image of ['b', 'a', 'c']) {
		await Image.create(
			{ data: { url: image, stage: { connect: { id: one.id } } } },
			M,
		)
	}
	return { schema, url, errors }
}

describe('a virtual over GraphQL', () => {
	it('is an output field with an argument per input property', async () => {
		const { schema } = await started()
		const type = schema?.getType('Stage')
		expect(isObjectType(type) && printType(type)).toBe(`type Stage {
  id: ID!
  createdAt: DateTime!
  updatedAt: DateTime!
  name: String!
  images(first: Int, after: String, last: Int, before: String, where: ImageWhereInput, orderBy: [ImageOrderByInput!]): StageImagesConnection!

  """Its name, loud."""
  label: String!
  thumb(size: Int!): String!
  maps(first: Int): [Image!]!
  summary: Summary!
}`)
	})

	it('reads its value, its arguments and a model’s rows in one query', async () => {
		const { url } = await started()
		const result = await post(
			url,
			`{ stages(first: 2, orderBy: [{ name: asc }]) { edges { node {
				label thumb(size: 200) summary { count }
				maps(first: 2) { url stage { name label } }
			} } } }`,
		)
		expect(result.errors).toBeUndefined()
		expect(at(result.data, 'stages', 'edges')).toStrictEqual([
			{
				node: {
					label: 'ONE',
					thumb: 'one@200',
					summary: { count: 2 },
					maps: [
						{ url: 'a', stage: { name: 'one', label: 'ONE' } },
						{ url: 'b', stage: { name: 'one', label: 'ONE' } },
					],
				},
			},
			{
				node: {
					label: 'TWO',
					thumb: 'two@200',
					summary: { count: 2 },
					maps: [],
				},
			},
		])
	})

	it('validates its arguments with the kernel’s message', async () => {
		const { url } = await started()
		const result = await post(
			url,
			'{ stages { edges { node { thumb(size: -1) } } } }',
		)
		expect(result.errors?.[0]?.message).toBe('Invalid input.')
		expect(at(result.errors?.[0]?.extensions, 'code')).toBe('VALIDATION_FAILED')
	})

	it('is computed in a function’s rows', async () => {
		const { url } = await started()
		const result = await post(url, '{ firstStage { name label } }')
		expect(result).toStrictEqual({
			data: { firstStage: { name: 'one', label: 'ONE' } },
		})
	})

	it('counts take rows for a list of a model', async () => {
		const { url } = await started({ maxRows: 30, take: 10 })
		expect((await post(url, threeWith(''))).errors).toBeUndefined()
		const refused = await post(url, threeWith('maps { url }'))
		expect(refused.errors?.[0]?.message).toBe(
			'The document asks for more than 30 rows. Ask for fewer with first or last.',
		)
	})

	it('holds no more than take rows under a selected relation', async () => {
		const { url, errors } = await started({ take: 2 })
		const plain = await post(
			url,
			'{ stages { edges { node { maps { url } } } } }',
		)
		expect(plain.errors).toBeUndefined()
		const related = await post(
			url,
			'{ stages { edges { node { maps { stage { name } } } } } }',
		)
		expect(related.errors?.[0]?.message).toBe('Internal error.')
		expect(errors).toStrictEqual([
			new RangeError(
				'Stage.maps returned 3 rows; a list counts take (2) rows, so it holds no more under a selected relation.',
			),
		])
	})
})

describe('a virtual’s input at startup', () => {
	it('is an object, whose properties are its arguments', async () => {
		const Odd = defineModel({
			name: 'Odd',
			use: [graphql()],
			fields: (f) => ({
				pick: f.virtual(z.string(), {
					input: z.string(),
				}),
			}),
		}).with({ access: allow.public, virtuals: { pick: { run: () => 'x' } } })
		app = defineApp({
			database: memory(),
			plugins: [httpPlugin({ port: 0 }), graphqlPlugin()],
			models: [Odd],
			logger: quiet,
		})
		await expect(app.start()).rejects.toThrow(
			'Odd.pick: its input is an object schema, whose properties are its arguments.',
		)
		app = undefined
	})
})
