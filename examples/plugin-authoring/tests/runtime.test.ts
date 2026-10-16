import { FrameworkError } from '@ultimabase/core'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { client } from '../src/client-plugin.ts'
import { runPluginCallback } from '../src/run-plugin-callback.ts'
import { sessionVersion } from '../src/sessions-plugin.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('composes two plugins through a capability', async () => {
	await using _t = await testApplication(ultimabase)
	expect(ultimabase.plugin('community.workflow-consumer')).toStrictEqual({
		format: 'compact',
	})
})

it('connects a lifecycle-only resource with the application', async () => {
	await using _t = await testApplication(ultimabase)
	expect(client.connected).toBe(true)
})

it('stops a callback at a safe boundary once its signal aborts', async () => {
	const controller = new AbortController()
	let ran = false
	await runPluginCallback(controller.signal, () => {
		ran = true
		return Promise.resolve()
	})
	expect(ran).toBe(true)

	controller.abort(new Error('client went away'))
	const cancelled = await runPluginCallback(controller.signal, () => {
		ran = false
		return Promise.resolve()
	}).catch((error: unknown) => error)
	expect(cancelled).toBeInstanceOf(FrameworkError)
	expect(cancelled).toMatchObject({ code: 'OPERATION_CANCELLED' })
	// The callback never started, and the arbitrary reason is not copied.
	expect(ran).toBe(true)
	expect(String(cancelled)).not.toContain('client went away')
})

it('keeps verifier records in owner-private storage', async () => {
	await using t = await testApplication(ultimabase)
	const versions = ultimabase.operation(sessionVersion)
	expect(await versions.execute('SESSION_SECRET')).toBe('none')
	expect(await versions.execute('SESSION_SECRET')).toBe('1')
	// No schema, REST route or GraphQL type exposes the collection.
	const response = await t.fetch('/api/classes/sessions')
	expect(response.status).toBe(404)
})
