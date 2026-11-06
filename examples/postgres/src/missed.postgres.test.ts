// A plugin that follows the change feed reads again, in `missed`, what it may
// have lost: a test writes a change the feed does not report, then calls it.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { postgres } from '@ultimabase/postgres'
import { testApplication } from '@ultimabase/testing'
import { defineApp, master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { Project, Task } from './models.ts'
import { counted, openTasks } from './open-tasks.ts'

// The repository's PostgreSQL tests run on TEST_DATABASE_URL; set before
// postgres() reads DATABASE_URL.
vi.hoisted(() => {
	const [url] = (process.env['TEST_DATABASE_URL'] ?? '').split(' ')
	process.env['DATABASE_URL'] ??=
		url || 'postgres://postgres:postgres@localhost:54315/postgres'
})

//#region missed-app
const database = postgres({ url: process.env['DATABASE_URL'] })
const app = defineApp({
	database,
	plugins: [httpPlugin(), graphqlPlugin(), openTasks.plugin()],
	models: [Project, Task],
})
const running = testApplication(app, { database: 'declared' })
//#endregion

//#region missed
it('counts the open tasks again after lost changes', async () => {
	const tasks = { create: [{ title: 'Write' }] }
	await Project.create({ data: { name: 'Launch', tasks } }, { as: master })
	await vi.waitFor(() => expect(counted.open).toBe(1))
	// Raw SQL: a change the feed does not report.
	await database.sql`update task set done = true`
	running.feed.missed()
	await vi.waitFor(() => expect(counted.open).toBe(0))
})
//#endregion
