// @vitest-environment happy-dom
// Renders the live task list as a browser would, under happy-dom: it shows
// two tasks, a third on demand, and a new one as soon as it is created.
import { ApolloProvider } from '@apollo/client/react'
import { testApplication } from '@ultimabase/testing'
import { createClient } from 'graphql-ws'
import { Window } from 'happy-dom'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { Task } from './models.ts'
import { TaskList, apolloClient } from './TaskList.tsx'

const running = testApplication(app)
const M = { as: master } as const

it('shows the tasks live, and more on demand', async () => {
	for (const [rank, title] of [
		[1, 'a'],
		[2, 'b'],
		[3, 'c'],
	] as const) {
		await Task.create({ data: { title, rank } }, M)
	}
	const socket = createClient({
		url: `${running.url.replace(/^http/, 'ws')}/graphql`,
	})
	const { document } = new Window()
	const container = document.createElement('div')
	document.body.append(container)
	const root = createRoot(container)
	root.render(
		createElement(ApolloProvider, {
			client: apolloClient(socket),
			children: createElement(TaskList),
		}),
	)
	const items = () =>
		[...container.querySelectorAll('li')].map((item) => item.textContent)

	await vi.waitFor(() => {
		expect(items()).toEqual(['a', 'b'])
	})
	container.querySelector('button')?.click()
	await vi.waitFor(() => {
		expect(items()).toEqual(['a', 'b', 'c'])
	})
	await Task.create({ data: { title: 'new', rank: 0 } }, M)
	await vi.waitFor(() => {
		expect(items()).toEqual(['new', 'a', 'b', 'c'])
	})
	expect(container.querySelector('button')).toBeNull()

	root.unmount()
	await socket.dispose()
})
