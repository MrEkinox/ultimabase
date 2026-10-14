import { testApplication } from '@ultimabase/testing'
import { expect, it, vi } from 'vitest'

import { createMaintenanceAnnouncement } from '../src/maintenance.ts'
import { Announcement, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('runs one audited Master command that Access would deny', async () => {
	await testApplication(ultimabase)
	const audit = vi.spyOn(console, 'info').mockImplementation(() => undefined)

	const denied = Announcement.createOne({ data: { title: 'Rebuild complete' } })
	await expect(denied).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	const created = await createMaintenanceAnnouncement('Rebuild complete')

	expect(created).toMatchObject({ title: 'Rebuild complete' })
	const masterUses = audit.mock.calls.filter(([line]) => line === 'Master use')
	expect(masterUses).toHaveLength(1)
	expect(masterUses[0]?.[1]).toMatchObject({ keyId: 'maintenance' })
	audit.mockRestore()
})

it('treats false like an omitted option', async () => {
	await testApplication(ultimabase)
	const isScheduledJob = false

	//#region conditional
	const attempt = Announcement.createOne(
		{ data: { title: 'Nightly report' } },
		{ useMasterKey: isScheduledJob },
	)
	//#endregion conditional

	await expect(attempt).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
})

it('never bypasses validation', async () => {
	await testApplication(ultimabase)

	await expect(
		Post.createOne(
			{ data: { slug: 'half', title: 'Half', views: 0.5 } },
			{ useMasterKey: true },
		),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	expect(await Post.count()).toBe(0)
})
