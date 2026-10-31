// A plugin that follows the change feed reads again, in `missed`, what it may
// have lost: a test writes a change the feed does not report, then calls it.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { postgres } from '@ultimabase/postgres'
import { testApplication } from '@ultimabase/testing'
import type { PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { Project, Task } from './models.ts'

// The repository's PostgreSQL tests run on TEST_DATABASE_URL; set before
// postgres() reads DATABASE_URL.
vi.hoisted(() => {
	const [url] = (process.env['TEST_DATABASE_URL'] ?? '').split(' ')
	process.env['DATABASE_URL'] ??=
		url || 'postgres://postgres:postgres@localhost:54315/postgres'
})

//#region plugin
// Keeps the number of open tasks, counted again when it may be wrong.
interface OpenTasks extends PluginTypes {
	readonly name: 'openTasks'
}

let open: number | undefined
const count = async () => {
	open = await Task.count({ where: { done: false } }, { as: master })
}

const openTasks = definePlugin<OpenTasks>({
	name: 'openTasks',
	start: count,
	changed: (changes) => {
		if (changes.some((change) => change.model === 'Task')) void count()
	},
	missed: () => void count(),
})
//#endregion

//#region missed
const database = postgres({ url: process.env['DATABASE_URL'] })
const app = defineApp({
	database,
	plugins: [httpPlugin(), graphqlPlugin(), openTasks.plugin()],
	models: [Project, Task],
})
const running = testApplication(app, { database: 'declared' })

it('counts the open tasks again after lost changes', async () => {
	const tasks = { create: [{ title: 'Write' }] }
	await Project.create({ data: { name: 'Launch', tasks } }, { as: master })
	await vi.waitFor(() => expect(open).toBe(1))
	// Raw SQL: a change the feed does not report.
	await database.sql`update task set done = true`
	running.feed.missed()
	await vi.waitFor(() => expect(open).toBe(0))
})
//#endregion
