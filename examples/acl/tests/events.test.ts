import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { aclAuditLog } from '../src/acl-audit-plugin.ts'
import { Member, Note } from '../src/schema.ts'
import { shareNote } from '../src/sharing.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('records each committed ACL change', async () => {
	await using t = await testApplication(ultimabase)
	const [ada, grace] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!ada || !grace) throw new TypeError('Missing members')
	const asAda = Member.pointer(ada.id)
	aclAuditLog.length = 0

	const note = await t.as(asAda, () =>
		Note.createOne({ data: { title: 'Plans' } }),
	)
	await t.as(asAda, () => shareNote(note.id, grace.id))
	// Sharing again changes nothing, so nothing is recorded.
	await t.as(asAda, () => shareNote(note.id, grace.id))
	await t.afterCommit()

	const target = { className: 'Note', id: note.id }
	const actor = {
		authority: 'anonymous',
		principal: { className: 'Member', id: ada.id },
	}
	expect(aclAuditLog).toStrictEqual([
		{
			actor,
			diff: {
				added: [
					{
						permissions: ['read', 'update', 'delete'],
						subject: { className: 'Member', id: ada.id, kind: 'principal' },
					},
				],
				removed: [],
			},
			operation: 'create',
			target,
		},
		{
			actor,
			diff: {
				added: [
					{
						permissions: ['read'],
						subject: { className: 'Member', id: grace.id, kind: 'principal' },
					},
				],
				removed: [],
			},
			operation: 'update',
			target,
		},
	])
})
