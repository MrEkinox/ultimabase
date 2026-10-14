import { RequestContext, requestSources } from '@ultimabase/core/plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it, vi } from 'vitest'

import { createMaintenanceAnnouncement } from '../src/maintenance.ts'
import { tenantId } from '../src/request-identity.ts'
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

it('elevates a supplied context and keeps its values', async () => {
	await testApplication(ultimabase)
	const audit = vi.spyOn(console, 'info').mockImplementation(() => undefined)

	//#region context-and-master
	const context = RequestContext.anonymous({
		requestId: 'import-1',
		source: requestSources.internal,
	}).withValue(tenantId, 'tenant-42')

	const imported = await Announcement.createMany(
		{ data: [{ title: 'Imported one' }, { title: 'Imported two' }] },
		{ context, useMasterKey: true },
	)
	//#endregion context-and-master

	expect(imported).toHaveLength(2)
	// Each item is one audited command of the supplied request.
	const masterUses = audit.mock.calls.filter(([line]) => line === 'Master use')
	expect(masterUses).toHaveLength(2)
	expect(masterUses[0]?.[1]).toMatchObject({ requestId: 'import-1' })
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
