import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'

// A role schema is an application schema: REST serves it like any other,
// and its Access rules decide.
it('serves staff roles under their rules', async () => {
	await using t = await testApplication(ultimabase)

	const roles = await t.fetch('/api/classes/StaffRole?select=name')
	expect(roles.status).toBe(200)
	// In identifier order: `ensure` created them in its own order.
	expect(await roles.json()).toMatchObject({
		results: [{ name: 'editor' }, { name: 'administrator' }],
	})

	// No write rule: a client cannot create a role.
	const created = await t.fetch('/api/classes/StaffRole', {
		body: JSON.stringify({ name: 'owner' }),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	})
	expect(created.status).toBe(403)
})
