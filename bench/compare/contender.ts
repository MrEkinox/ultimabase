// What each contender implements (D-100): the same cases, written as its
// documentation shows, each returning the written row or the rows read.

export type Contender = {
	readonly name: string
	/** Whether it creates its tables itself, rather than from `tables`. */
	readonly createsTables: boolean
	/** Connects to `url`, whose `search_path` is `schema`, the contender's own. */
	readonly start: (url: string, schema: string) => Promise<void>
	readonly stop: () => Promise<void>
	readonly createGenre: (label: string) => Promise<{ readonly id: string }>
	readonly createWriter: (name: string) => Promise<{ readonly id: string }>
	/** A novel of `writer` in `genres`. */
	readonly createNovel: (
		title: string,
		writer: string,
		genres: readonly string[],
	) => Promise<{ readonly id: string }>
	readonly renameWriter: (id: string, name: string) => Promise<unknown>
	/** Moves the novel from the genre `from` to `to`, returns the novel. */
	readonly regenre: (
		novel: string,
		from: string,
		to: string,
	) => Promise<unknown>
	/** Deletes the writer; their novels go with them. */
	readonly deleteWriter: (id: string) => Promise<unknown>
	/** Two genres in one transaction. */
	readonly createGenres: (a: string, b: string) => Promise<unknown>
	readonly findWriter: (id: string) => Promise<unknown>
	/** The first `take` writers by id, their novels and the novels' genres. */
	readonly findWriters: (take: number) => Promise<readonly unknown[]>
}

/** The tables of the contenders that do not create their own. */
export const tables = `
create table "writer" (
	"id" uuid primary key default gen_random_uuid(),
	"created_at" timestamptz(3) not null default now(),
	"updated_at" timestamptz(3) not null default now(),
	"name" text not null
);
create table "novel" (
	"id" uuid primary key default gen_random_uuid(),
	"created_at" timestamptz(3) not null default now(),
	"updated_at" timestamptz(3) not null default now(),
	"title" text not null,
	"writer_id" uuid not null references "writer" ("id") on delete cascade
);
create index on "novel" ("writer_id");
create table "genre" (
	"id" uuid primary key default gen_random_uuid(),
	"created_at" timestamptz(3) not null default now(),
	"updated_at" timestamptz(3) not null default now(),
	"label" text not null
);
create table "_genre_novels" (
	"A" uuid not null references "genre" ("id") on delete cascade,
	"B" uuid not null references "novel" ("id") on delete cascade,
	primary key ("A", "B")
);
create index on "_genre_novels" ("B");
`
