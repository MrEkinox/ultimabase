// Virtual fields over REST (D-151): in the default row without an input, in
// `select` and `include` with one, a model's rows selected like a
// relation's, counted by the row budget, and `readOnly` in the document.
import { z } from 'zod'
import {
	allow,
	defineFunction,
	defineModel,
	defineType,
	memory,
} from 'ultimabase'
import { afterEach, describe, expect, it } from 'vitest'
import { rest } from './index.ts'
import type { RestOptions } from './index.ts'
import { M, at, call, qs, started } from './test/app.ts'

const Summary = defineType({
	name: 'Summary',
	fields: { count: z.int() },
})

const Stage = defineModel({
	name: 'Stage',
	use: [rest()],
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
	use: [rest()],
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

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

/** The application, two stages and three images; returns its URL. */
async function serving(options: RestOptions = { pagination: 'list' }) {
	const running = await started(options, memory(), [firstStage], [Stage, Image])
	stop = async () => running.app.stop()
	const one = await Stage.create({ data: { name: 'one', secret: 's' } }, M)
	await Stage.create({ data: { name: 'two', secret: 's' } }, M)
	for (const image of ['b', 'a', 'c']) {
		await Image.create(
			{ data: { url: image, stage: { connect: { id: one.id } } } },
			M,
		)
	}
	return running
}

const ordered = { orderBy: { name: 'asc' } }
const threeWith = (select: object) =>
	`/api/stages${qs({ take: 3, select: { name: true, ...select } })}`
const mapsWith = (select: object) =>
	`/api/stages${qs({ select: { maps: { select } } })}`

describe('a virtual over REST', () => {
	it('is in the default row without an input', async () => {
		const { url } = await serving()
		const { body } = await call(url, 'GET', `/api/stages${qs(ordered)}`)
		expect(at(body, 0, 'label')).toBe('ONE')
		expect(Object.keys(at(body, 0) ?? {})).toStrictEqual([
			'id',
			'createdAt',
			'updatedAt',
			'name',
			'label',
		])
	})

	it('reads its input, a model’s rows and a type in select', async () => {
		const { url } = await serving()
		const select = {
			name: true,
			thumb: { size: 200 },
			summary: true,
			maps: {
				first: 2,
				select: { url: true, stage: { select: { name: true, label: true } } },
			},
		}
		const sent = await call(
			url,
			'GET',
			`/api/stages${qs({ ...ordered, take: 2, select })}`,
		)
		expect(sent.body).toStrictEqual([
			{
				name: 'one',
				thumb: 'one@200',
				summary: { count: 2 },
				maps: [
					{ url: 'a', stage: { name: 'one', label: 'ONE' } },
					{ url: 'b', stage: { name: 'one', label: 'ONE' } },
				],
			},
			{ name: 'two', thumb: 'two@200', summary: { count: 2 }, maps: [] },
		])
	})

	it('adds itself to the default row in include', async () => {
		const { url } = await serving()
		const include = { thumb: { size: 1 }, label: true }
		const { body } = await call(
			url,
			'GET',
			`/api/stages${qs({ ...ordered, include })}`,
		)
		expect(Object.keys(at(body, 0) ?? {})).toStrictEqual([
			'id',
			'createdAt',
			'updatedAt',
			'name',
			'label',
			'thumb',
		])
		expect(at(body, 0, 'thumb')).toBe('one@1')
	})

	it('validates its input with the kernel’s message', async () => {
		const { url } = await serving()
		const invalid = await call(
			url,
			'GET',
			`/api/stages${qs({ select: { thumb: { size: -1 } } })}`,
		)
		expect(invalid.status).toBe(400)
		expect(at(invalid.body, 'code')).toBe('VALIDATION_FAILED')
		const shaped = await call(
			url,
			'GET',
			`/api/stages${qs({ select: { maps: 5 } })}`,
		)
		expect(shaped.status).toBe(400)
		expect(at(shaped.body, 'message')).toBe(
			'select.maps must be true or an object.',
		)
	})

	it('is computed in a function’s rows', async () => {
		const { url } = await serving()
		const { body } = await call(url, 'GET', '/api/functions/firstStage')
		expect(at(body, 'name')).toBe('one')
		expect(at(body, 'label')).toBe('ONE')
	})

	it('counts take rows for a list of a model', async () => {
		const { url } = await serving({ pagination: 'list', maxRows: 30, take: 10 })
		expect((await call(url, 'GET', threeWith({}))).status).toBe(200)
		const refused = await call(url, 'GET', threeWith({ maps: true }))
		expect(refused.status).toBe(400)
		expect(at(refused.body, 'message')).toBe(
			'The request asks for more than 30 rows. Ask for fewer with take.',
		)
	})

	it('holds no more than take rows under a selected relation', async () => {
		const { url, lines } = await serving({ pagination: 'list', take: 2 })
		expect((await call(url, 'GET', mapsWith({ url: true }))).status).toBe(200)
		const related = await call(url, 'GET', mapsWith({ stage: true }))
		expect(related.status).toBe(500)
		const errors = lines
			.filter((line) => line.level === 'error')
			.map((line): unknown => Reflect.get(Object(line.first), 'err'))
		expect(errors).toStrictEqual([
			new RangeError(
				'Stage.maps returned 3 rows; a list counts take (2) rows, so it holds no more under a selected relation.',
			),
		])
	})
})

describe('a virtual in the OpenAPI document', () => {
	it('is a readOnly property, its input in select', async () => {
		const { url } = await serving()
		const { body } = await call(url, 'GET', '/api/openapi.json')
		const schema = (name: string) => at(body, 'components', 'schemas', name)
		const stage = schema('Stage')
		expect(at(stage, 'required')).toStrictEqual([
			'id',
			'createdAt',
			'updatedAt',
			'name',
			'label',
		])
		expect(at(stage, 'properties', 'label')).toStrictEqual({
			type: 'string',
			readOnly: true,
			description: 'Its name, loud.',
		})
		expect(at(stage, 'properties', 'maps')).toStrictEqual({
			type: 'array',
			items: { $ref: '#/components/schemas/Image' },
			readOnly: true,
		})
		expect(at(stage, 'properties', 'leak')).toBeUndefined()
		const select = at(schema('StageSelect'), 'properties')
		expect(at(select, 'label')).toStrictEqual({ type: 'boolean' })
		expect(at(select, 'thumb', 'required')).toStrictEqual(['size'])
		expect(at(select, 'maps')).toStrictEqual({
			anyOf: [
				{ type: 'boolean' },
				{ $ref: '#/components/schemas/StageMapsArgs' },
			],
		})
		expect(
			Object.keys(at(schema('StageMapsArgs'), 'properties') ?? {}),
		).toStrictEqual(['first', 'select', 'include'])
		expect(at(select, 'leak')).toBeUndefined()
	})
})
