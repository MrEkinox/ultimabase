// UltimaBase, as Master: no access rule or hook runs (D-100).
import {
	defineApp,
	defineModel,
	master,
	transaction,
} from '../../packages/ultimabase/src/index.ts'
import type { App } from '../../packages/ultimabase/src/index.ts'
import { postgres } from '../../packages/postgres/src/index.ts'
import { silent } from '../../packages/testing/src/silent.ts'
import type { Contender } from './contender.ts'

const M = { as: master }

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({ name: f.string(), novels: f.many(() => Novel) }),
})

const Novel = defineModel({
	name: 'Novel',
	fields: (f) => ({
		title: f.string(),
		writer: f.one(() => Writer, { onDelete: 'cascade' }),
		genres: f.many(() => Genre),
	}),
})

const Genre = defineModel({
	name: 'Genre',
	fields: (f) => ({ label: f.string(), novels: f.many(() => Novel) }),
})

let app: App<unknown> | undefined

export const ultimabase: Contender = {
	name: 'UltimaBase',
	createsTables: true,
	start: async (url) => {
		app = defineApp({
			database: postgres({ url }),
			models: [Writer, Novel, Genre],
			logger: silent,
		})
		await app.start()
	},
	stop: async () => app?.stop(),
	createGenre: async (label) => Genre.create({ data: { label } }, M),
	createWriter: async (name) => Writer.create({ data: { name } }, M),
	createNovel: async (title, writer, genres) =>
		Novel.create(
			{
				data: {
					title,
					writer: { connect: { id: writer } },
					genres: { connect: genres.map((id) => ({ id })) },
				},
			},
			M,
		),
	renameWriter: async (id, name) =>
		Writer.update({ where: { id }, data: { name } }, M),
	regenre: async (id, from, to) =>
		Novel.update(
			{
				where: { id },
				data: {
					genres: { disconnect: [{ id: from }], connect: [{ id: to }] },
				},
			},
			M,
		),
	deleteWriter: async (id) => Writer.delete({ where: { id } }, M),
	createGenres: async (a, b) =>
		transaction(async () => [
			await Genre.create({ data: { label: a } }, M),
			await Genre.create({ data: { label: b } }, M),
		]),
	findWriter: async (id) => Writer.findUnique({ where: { id } }, M),
	findWriters: async (take) =>
		Writer.findMany(
			{ take, include: { novels: { include: { genres: true } } } },
			M,
		),
}
