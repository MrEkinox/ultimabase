// The application's queries on PostgreSQL, in a schema of this file's own.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { Project, Task } from './models.ts'

// The repository's PostgreSQL tests run on TEST_DATABASE_URL; set before
// app.ts reads DATABASE_URL.
vi.hoisted(() => {
	const [url] = (process.env['TEST_DATABASE_URL'] ?? '').split(' ')
	process.env['DATABASE_URL'] ??=
		url || 'postgres://postgres:postgres@localhost:54315/postgres'
})

//#region declared
// On the database DATABASE_URL names: the file's own schema, its tables
// emptied before each test, dropped after the last.
testApplication(app, { database: 'declared' })

it('deletes the tasks with their project', async () => {
	const project = await Project.create(
		{ data: { name: 'Launch', tasks: { create: [{ title: 'Write' }] } } },
		{ as: master },
	)
	await Project.delete({ where: { id: project.id } }, { as: master })
	expect(await Task.count({}, { as: master })).toBe(0)
})

it('starts with empty tables', async () => {
	expect(await Project.count({}, { as: master })).toBe(0)
})
//#endregion
