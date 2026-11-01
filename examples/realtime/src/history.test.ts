// A long list: 50 tasks live, at most, then the next ones read once.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { afterEach, expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { history } from './history.ts'
import { Task } from './models.ts'

const running = testApplication(app)
const M = { as: master } as const

const stops: (() => void)[] = []
afterEach(() => {
	for (const stop of stops.splice(0)) stop()
})

it('follows 50 tasks live, then reads the next ones once', async () => {
	const data = Array.from({ length: 60 }, (_, rank) => ({
		title: `t${String(rank)}`,
		rank,
	}))
	await Task.createMany({ data }, M)
	const tasks = history(running.url)
	stops.push(tasks.stop)
	await vi.waitFor(() => expect(tasks.shown()).toHaveLength(25))

	await tasks.more()
	expect(tasks.shown()).toHaveLength(50)
	// Past maxLive, 50 on Task: the live list stays, the rest is read once.
	await tasks.more()
	expect(tasks.shown().map(({ title }) => title)).toEqual(
		data.map(({ title }) => title),
	)
	await tasks.more()
	expect(tasks.shown()).toHaveLength(60)

	await Task.updateMany({ where: { rank: 0 }, data: { title: 'first' } }, M)
	await vi.waitFor(() => expect(tasks.shown()[0]?.title).toBe('first'))
})
