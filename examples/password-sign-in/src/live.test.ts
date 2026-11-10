// auth's viewer, live (D-362): a subscription over WebSocket sends the
// signed-in user again once their email is verified. Each message is
// compared with its file under requests/ (D-282).
import { testApplication } from '@ultimabase/testing'
import type { Client } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { afterEach, it } from 'vitest'
import { z } from 'zod'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { emailed } from './mail.ts'

const running = testApplication(app)
const { file, check, document, matches } = requestFiles(
	new URL('requests/', import.meta.url),
	running,
)

const sockets: Client[] = []
afterEach(async () => {
	await Promise.all(sockets.splice(0).map(async (socket) => socket.dispose()))
})

/** The next message of a subscription. */
async function next(results: AsyncIterator<unknown>): Promise<unknown> {
	const result = await results.next()
	if (result.done === true) throw new Error('The subscription completed.')
	return result.value
}

/** Ada's session token, from a sign-up. */
async function signedUp(): Promise<string> {
	const input = {
		email: 'ada@example.com',
		password: 'correct horse',
		name: 'Ada',
	}
	const body = z
		.object({ data: z.object({ signUp: z.object({ token: z.string() }) }) })
		.parse(await file('sign-up', { input }))
	return body.data.signUp.token
}

it('sends the viewer again once their email is verified', async () => {
	const token = await signedUp()
	//#region subscribe
	// A WebSocket sends its token in connection_init's parameters.
	const client = createClient({
		url: `${running.url.replace(/^http/, 'ws')}/graphql`,
		connectionParams: { authorization: `Bearer ${token}` },
	})
	//#endregion
	sockets.push(client)
	const results = client.iterate({ query: document('live-viewer') })
	matches('live-viewer', await next(results))
	await check('verify-email', { input: { token: await emailed('verify') } })
	matches('live-viewer-verified', await next(results))
})
