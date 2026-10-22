// Raw `pg`, the floor: one statement a case, written by hand (D-100).
import { Pool } from 'pg'
import type { Contender } from './contender.ts'

let pool: Pool | undefined

async function rows(
	text: string,
	values: readonly unknown[],
): Promise<unknown[]> {
	if (pool === undefined) throw new Error('pg has not started.')
	const result = await pool.query<Record<string, unknown>>(text, [...values])
	return result.rows
}

async function row(
	text: string,
	values: readonly unknown[],
): Promise<{ readonly id: string }> {
	const [found] = await rows(text, values)
	if (
		typeof found !== 'object' ||
		found === null ||
		!('id' in found) ||
		typeof found.id !== 'string'
	) {
		throw new Error('No row.')
	}
	return { ...found, id: found.id }
}

/** A writer's novels, each with its genres, as one JSON column. */
const novels = `coalesce((
	select jsonb_agg(to_jsonb(n) || jsonb_build_object('genres', coalesce((
		select jsonb_agg(to_jsonb(g) order by g."id")
		from "_genre_novels" j join "genre" g on g."id" = j."A"
		where j."B" = n."id"
	), '[]')) order by n."id")
	from "novel" n where n."writer_id" = w."id"
), '[]') as "novels"`

export const sql: Contender = {
	name: 'pg',
	createsTables: false,
	start: async (url) => {
		pool = new Pool({ connectionString: url })
	},
	stop: async () => pool?.end(),
	createGenre: async (label) =>
		row('insert into "genre" ("label") values ($1) returning *', [label]),
	createWriter: async (name) =>
		row('insert into "writer" ("name") values ($1) returning *', [name]),
	createNovel: async (title, writer, genres) =>
		row(
			`with n as (
				insert into "novel" ("title", "writer_id") values ($1, $2) returning *
			), j as (
				insert into "_genre_novels" ("A", "B")
				select unnest($3::uuid[]), n."id" from n
			)
			select * from n`,
			[title, writer, genres],
		),
	renameWriter: async (id, name) =>
		row(
			'update "writer" set "name" = $2, "updated_at" = now() where "id" = $1 returning *',
			[id, name],
		),
	regenre: async (id, from, to) =>
		row(
			`with d as (
				delete from "_genre_novels" where "B" = $1 and "A" = $2
			), i as (
				insert into "_genre_novels" ("A", "B") values ($3, $1)
				on conflict do nothing
			)
			select * from "novel" where "id" = $1`,
			[id, from, to],
		),
	deleteWriter: async (id) =>
		row('delete from "writer" where "id" = $1 returning *', [id]),
	createGenres: async (a, b) =>
		rows('insert into "genre" ("label") values ($1), ($2) returning *', [a, b]),
	findWriter: async (id) => row('select * from "writer" where "id" = $1', [id]),
	findWriters: async (take) =>
		rows(`select w.*, ${novels} from "writer" w order by w."id" limit $1`, [
			take,
		]),
}
