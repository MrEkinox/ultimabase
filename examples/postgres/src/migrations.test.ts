// The files `migrate create` wrote in migrations/, and the SQL written in
// the two that held no model change.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const migrations = join(import.meta.dirname, '..', 'migrations')
const lines = async (file: string): Promise<string[]> =>
	(await readFile(join(migrations, file), 'utf8')).split('\n')
const header =
	'-- ultimabase schema 2fd2b10f400fc79147980938759b63aa232ffc47d63c95701d415c339b13725c'

it('holds the change of a model, written by migrate create', async () => {
	//#region add-priority
	// After `priority` was added to Task: `migrate create add_priority`.
	expect(await lines('20261029230454_add_priority.sql')).toEqual([
		header,
		'',
		'alter table "task" add column "priority" integer not null default 0;',
		'',
		'alter table "task" alter column "priority" drop default;',
		'',
	])
	//#endregion
})

it('holds SQL of its own in a migration without a model change', async () => {
	//#region data
	// `migrate create first_tasks_urgent`, then the update written in it.
	expect(await lines('20261029230505_first_tasks_urgent.sql')).toEqual([
		header,
		'',
		'-- The tasks written before priorities came first.',
		'update "task" set "priority" = 1 where not "done";',
		'',
	])
	//#endregion
	//#region no-transaction
	// A statement PostgreSQL runs outside a transaction, alone in its file.
	expect(await lines('20261029230507_open_tasks_index.sql')).toEqual([
		header,
		'-- ultimabase no transaction',
		'',
		'-- Built without locking the table against writes.',
		'create index concurrently "task_open_idx" on "task" ("project_id") where not "done";',
		'',
	])
	//#endregion
})
