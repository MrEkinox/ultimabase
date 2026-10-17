import { MasterAuthority } from '@ultimabase/core'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { App } from '../src/app.ts'
import {
	Announcement,
	Author,
	Comment,
	Post,
	Translation,
} from '../src/schema.ts'

// A second application of the same schemas whose audit sink fails. This file
// does not import `src/ultimabase.ts`: one application per test file.
const failingAudit = new App({
	masterAuthority: new MasterAuthority({
		onUse: () => {
			throw new Error('Audit sink unavailable')
		},
	}),
	schemas: [Author, Post, Comment, Translation, Announcement],
})

it('writes nothing when the audit fails', async () => {
	await testApplication(failingAudit)

	await expect(
		Announcement.createOne(
			{ data: { title: 'Unaudited' } },
			{ useMasterKey: true },
		),
	).rejects.toThrow()
	expect(await Announcement.count()).toBe(0)
})
