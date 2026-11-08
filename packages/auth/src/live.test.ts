// A live viewer ends with its session or its user, though a request kept
// its caller first (D-343): the usual order in a browser, which sends a
// request before it opens its socket.
import type { Realtime, RealtimeApi } from '@ultimabase/realtime'
import { realtimePlugin } from '@ultimabase/realtime'
import { afterEach, expect, it, vi } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import { bearer, callerOf, M, signIn, started, User } from './test/app.ts'

interface Following extends PluginTypes {
	readonly name: 'following'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
/** Keeps the realtime API. */
const following = definePlugin<Following>({
	name: 'following',
	manifest: {
		name: 'following',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

/** A viewer of ada's, opened after a request kept her caller, and whether it closed. */
async function opened() {
	const running = await started(undefined, [
		realtimePlugin(),
		following.plugin(),
	])
	stop = async () => running.app.stop()
	const { token } = await signIn(running.url, running.ada.id)
	expect((await callerOf(running.url, bearer(token))).status).toBe(200)
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(
		new Request(running.url, { headers: bearer(token) }),
	)
	const state = { closed: false }
	viewer.onClose(() => {
		state.closed = true
	})
	return { ada: running.ada, state }
}

it('ends a viewer when its sessions are revoked', async () => {
	const { ada, state } = await opened()
	await User.revokeSessions({ id: ada.id }, M)
	await vi.waitFor(() => expect(state.closed).toBe(true))
})

it('ends a viewer when its user is deleted', async () => {
	const { ada, state } = await opened()
	await User.delete({ where: { id: ada.id } }, M)
	await vi.waitFor(() => expect(state.closed).toBe(true))
})
