// A field type's own options (D-152): its builder takes them, each of its
// functions and its shape receive them, and its stored field's value default
// fills the rows stored before the field.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { ExposedModel, PluginTypes } from './index.ts'
import {
	defineApp,
	defineFieldType,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { schemaOf } from './lifecycle.ts'

const M = { as: master }

type ScoreOptions = { readonly max?: number }
type Score = { readonly value: number; readonly max: number | undefined }

/** A score under its field's `max`, which code reads with that `max`. */
const score = defineFieldType({
	plugin: 'score',
	options: ['max'],
	stored: (f, _options: ScoreOptions) => f.number({ default: 0 }),
	decode: (value, { max }): Score => ({ value, max }),
	encode: (value) => value.value,
	schema: ({ max }: ScoreOptions) =>
		z
			.number()
			.max(max ?? 100)
			.transform((value): Score => ({ value, max })),
	toJSON: (value, { max }) => ({ value: value.value, max: max ?? null }),
	shape: ({ max }: ScoreOptions) =>
		z.object({ value: z.number().max(max ?? 100), max: z.number().nullable() }),
})

interface Scores extends PluginTypes {
	readonly name: 'score'
}
/** What the plugin reads of the application's models. */
let models: readonly ExposedModel[] = []
/** The hooks the plugin ran, with the model each ran on. */
const ran: string[] = []
const scores = definePlugin<Scores>({
	name: 'score',
	start: (context) => {
		models = context.models
	},
	hooks: {
		afterCreate: ({ name, options }) => {
			ran.push(`create ${name} ${JSON.stringify(options)}`)
		},
		afterDelete: ({ name }) => {
			ran.push(`delete ${name}`)
		},
	},
	manifest: {
		name: 'test-score',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
})

const Game = defineModel({
	name: 'Game',
	fields: () => ({ low: score({ max: 3 }), high: score() }),
})

const options = {
	database: memory(),
	plugins: [scores.plugin()],
	models: [Game],
}

describe('a field type with options', () => {
	let stop: (() => Promise<void>) | undefined
	afterEach(async () => stop?.())

	it('gives each field its options, in every function', async () => {
		const app = defineApp(options)
		await app.start()
		stop = async () => app.stop()
		const game = await Game.create({ data: { low: 2, high: 50 } }, M)
		expect(game.low).toStrictEqual({ value: 2, max: 3 })
		expectTypeOf(game.low).toEqualTypeOf<Score>()
		const read = await Game.findUnique({ where: { id: game.id } }, M)
		expect(read?.high).toStrictEqual({ value: 50, max: undefined })
		await expect(
			Game.update({ where: { id: game.id }, data: { low: 5 } }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		const [low, high] = models
			.flatMap(({ fieldTypes }) => Object.values(fieldTypes))
			.map(({ toJSON }) => toJSON(game.low))
		expect([low, high]).toStrictEqual([
			{ value: 2, max: 3 },
			{ value: 2, max: null },
		])
		const shape = models[0]?.fieldTypes['low']?.shape
		const checked = await shape?.['~standard'].validate({ value: 4, max: 3 })
		expect(checked?.issues).toHaveLength(1)
	})

	it('runs its plugin’s hooks on a model holding one, without use', async () => {
		const app = defineApp(options)
		await app.start()
		stop = async () => app.stop()
		ran.length = 0
		const game = await Game.create({ data: { low: 1, high: 1 } }, M)
		// Its delete runs the hook: no single write without loading rows.
		await Game.delete({ where: { id: game.id } }, M)
		expect(ran).toStrictEqual(['create Game {}', 'delete Game'])
	})

	it('fills the rows stored before it with its stored field’s value default', () => {
		const game = schemaOf(options).models.find(({ name }) => name === 'Game')
		expect(game?.fields.find(({ name }) => name === 'low')).toMatchObject({
			type: 'number',
			default: 0,
		})
	})

	it('refuses an option it does not name', () => {
		// @ts-expect-error: a score takes max, not min.
		expect(() => score({ min: 1 })).toThrow(
			'A score field takes default, description, max only, not min.',
		)
	})

	it('refuses a function as its stored field’s default, and bad names', () => {
		const base = {
			plugin: 'bad',
			decode: (value: number) => value,
			encode: (value: number) => value,
			schema: z.number(),
			toJSON: (value: number) => value,
		}
		expect(() =>
			// @ts-expect-error: a stored field's default is a value.
			defineFieldType({
				...base,
				stored: (f) => f.number({ default: () => 1 }),
			}),
		).toThrow(
			'defineFieldType(bad): the stored field takes list, optional, precision, scale or a value as its default only, not default.',
		)
		expect(() =>
			defineFieldType({
				...base,
				stored: (f) => f.number(),
				// @ts-expect-error: options lists names.
				options: 'max',
			}),
		).toThrow('defineFieldType(bad): options is a list of option names.')
		expect(() =>
			defineFieldType({
				...base,
				stored: (f) => f.number(),
				// @ts-expect-error: a shape is a Standard Schema.
				shape: { type: 'number' },
			}),
		).toThrow('defineFieldType(bad): shape is a Standard Schema.')
	})
})
