import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { guestbook } from '../src/guestbook.ts'

it('refuses to expose writes without a policy', async () => {
	// The guestbook without `publicWrites`.
	const Unprotected = UltimaBase.use(
		httpPlugin({ appId: 'guestbook' }),
		restPlugin(),
		postgresPlugin(),
	)
	const Entry = Unprotected.Schema.define({
		className: 'Entry',
		fields: (field) => ({ message: field.string({ required: true }) }),
	})

	await expect(
		testApplication(new Unprotected({ schemas: [Entry] })),
	).rejects.toThrow(
		'REST exposes writes (POST /api/classes/Entry, PATCH /api/classes/Entry/{id}, DELETE /api/classes/Entry/{id}) but no protected policy plugin is installed: install one, such as accessPlugin(), or pass restPlugin({ publicWrites: true }) to let every client write.',
	)
})

it('lets every client write with publicWrites', async () => {
	await using t = await testApplication(guestbook)

	const signed = await t.fetch('/api/classes/Entry', {
		body: JSON.stringify({ message: 'Hello from a visitor' }),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	})
	expect(signed.status).toBe(201)
	const entries = await t.fetch('/api/classes/Entry?select=message')
	expect(await entries.json()).toMatchObject({
		results: [{ message: 'Hello from a visitor' }],
	})
})
