// The plugin's own WebSocket: the task list, then what changed.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { Task } from './models.ts'

const running = testApplication(app)
const M = { as: master } as const

it('sends the tasks over its own socket', async () => {
	await Task.create({ data: { title: 'a', rank: 1 } }, M)
	//#region client
	const socket = new WebSocket(`${running.url.replace(/^http/, 'ws')}/tasks`)
	const messages: unknown[] = []
	socket.addEventListener('message', ({ data }) => {
		const message: unknown = JSON.parse(String(data))
		messages.push(message)
	})
	await vi.waitFor(() => expect(messages).toHaveLength(1))
	expect(messages[0]).toMatchObject({ kind: 'reset' })

	await Task.create({ data: { title: 'b', rank: 2 } }, M)
	await vi.waitFor(() => expect(messages).toHaveLength(2))
	expect(messages[1]).toMatchObject({ kind: 'changes' })
	//#endregion
	const closed = new Promise((done) => socket.addEventListener('close', done))
	socket.close()
	await closed
})
