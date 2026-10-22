// Drizzle with node-postgres and its relational queries, as its
// documentation shows (D-100).
import { and, eq, relations } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
	index,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/pg-core'
import { Pool } from 'pg'
import type { Contender } from './contender.ts'

const stamps = {
	id: uuid('id').primaryKey().defaultRandom(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
}

const writer = pgTable('writer', { ...stamps, name: text('name').notNull() })

const novel = pgTable('novel', {
	...stamps,
	title: text('title').notNull(),
	writerId: uuid('writer_id')
		.notNull()
		.references(() => writer.id, { onDelete: 'cascade' }),
})

const genre = pgTable('genre', { ...stamps, label: text('label').notNull() })

const genreNovels = pgTable(
	'_genre_novels',
	{
		genreId: uuid('A')
			.notNull()
			.references(() => genre.id, { onDelete: 'cascade' }),
		novelId: uuid('B')
			.notNull()
			.references(() => novel.id, { onDelete: 'cascade' }),
	},
	(table) => [
		primaryKey({ columns: [table.genreId, table.novelId] }),
		index().on(table.novelId),
	],
)

const writerRelations = relations(writer, ({ many }) => ({
	novels: many(novel),
}))
const novelRelations = relations(novel, ({ one, many }) => ({
	writer: one(writer, { fields: [novel.writerId], references: [writer.id] }),
	genres: many(genreNovels),
}))
const genreRelations = relations(genre, ({ many }) => ({
	novels: many(genreNovels),
}))
const genreNovelsRelations = relations(genreNovels, ({ one }) => ({
	genre: one(genre, { fields: [genreNovels.genreId], references: [genre.id] }),
	novel: one(novel, { fields: [genreNovels.novelId], references: [novel.id] }),
}))

const schema = {
	writer,
	novel,
	genre,
	genreNovels,
	writerRelations,
	novelRelations,
	genreRelations,
	genreNovelsRelations,
}

let pool: Pool | undefined
let database: NodePgDatabase<typeof schema> | undefined

function db(): NodePgDatabase<typeof schema> {
	if (database === undefined) throw new Error('Drizzle has not started.')
	return database
}

async function first<T>(rows: Promise<readonly T[]>): Promise<T> {
	const [row] = await rows
	if (row === undefined) throw new Error('No row.')
	return row
}

export const drizzleContender: Contender = {
	name: 'Drizzle',
	createsTables: false,
	start: async (url) => {
		pool = new Pool({ connectionString: url })
		database = drizzle(pool, { schema })
	},
	stop: async () => pool?.end(),
	createGenre: async (label) =>
		first(db().insert(genre).values({ label }).returning()),
	createWriter: async (name) =>
		first(db().insert(writer).values({ name }).returning()),
	createNovel: async (title, writerId, genres) =>
		db().transaction(async (tx) => {
			const row = await first(
				tx.insert(novel).values({ title, writerId }).returning(),
			)
			await tx
				.insert(genreNovels)
				.values(genres.map((genreId) => ({ genreId, novelId: row.id })))
			return row
		}),
	renameWriter: async (id, name) =>
		first(
			db().update(writer).set({ name }).where(eq(writer.id, id)).returning(),
		),
	regenre: async (id, from, to) =>
		db().transaction(async (tx) => {
			await tx
				.delete(genreNovels)
				.where(and(eq(genreNovels.novelId, id), eq(genreNovels.genreId, from)))
			await tx
				.insert(genreNovels)
				.values({ genreId: to, novelId: id })
				.onConflictDoNothing()
			return first(tx.select().from(novel).where(eq(novel.id, id)))
		}),
	deleteWriter: async (id) =>
		first(db().delete(writer).where(eq(writer.id, id)).returning()),
	createGenres: async (a, b) =>
		db().transaction(async (tx) => [
			await first(tx.insert(genre).values({ label: a }).returning()),
			await first(tx.insert(genre).values({ label: b }).returning()),
		]),
	findWriter: async (id) =>
		db().query.writer.findFirst({ where: eq(writer.id, id) }),
	findWriters: async (take) =>
		db().query.writer.findMany({
			limit: take,
			orderBy: (table, { asc }) => [asc(table.id)],
			with: {
				novels: {
					orderBy: (table, { asc }) => [asc(table.id)],
					with: { genres: { with: { genre: true } } },
				},
			},
		}),
}
