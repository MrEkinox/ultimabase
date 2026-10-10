import { test } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Member = UltimaBase.Schema.define({
	className: 'LinkTypeMember',
	fields: (field) => ({ name: field.string() }),
})

const Other = UltimaBase.Schema.define({
	className: 'LinkTypeOther',
	fields: (field) => ({ name: field.string() }),
})

const Team = UltimaBase.Schema.define({
	className: 'LinkTypeTeam',
	fields: (field) => ({
		lead: field.pointer({ target: () => Member }),
		members: field.relation({ target: () => Member }),
		name: field.string(),
		owner: field.pointer({ target: () => Member, required: true }),
	}),
})

declare const team: Awaited<ReturnType<typeof Team.findOneOrThrow>>

test('links pointers and relations through one vocabulary (ADR-0308)', () => {
	void Team.createOne({
		data: {
			lead: null,
			members: { connect: ['member-1', Member.pointer('member-2')] },
			owner: { connect: Member.pointer('member-1') },
		},
	})
	void Team.createOne({ data: { owner: { connect: team.owner } } })
	void Team.createOne({ data: { owner: { create: { name: 'Ada' } } } })
	void Team.updateOne({
		where: { id: team.id },
		data: {
			lead: null,
			members: { disconnect: [Member.pointer('member-1')] },
			owner: { update: { name: 'Renamed' } },
		},
	})
	void Team.updateOne({
		where: { id: team.id },
		data: { members: { set: [] } },
	})
	void Team.createMany({ data: [{ owner: { connect: 'member-1' } }] })
	void Team.upsertOne({
		where: { id: team.id },
		create: { owner: { connect: Member.pointer('member-1') } },
		update: { lead: null },
	})
})

test('rejects every other link form', () => {
	// @ts-expect-error -- A raw Pointer is not a link.
	void Team.createOne({ data: { owner: Member.pointer('member-1') } })
	// @ts-expect-error -- A raw id is not a link.
	void Team.createOne({ data: { owner: 'member-1' } })
	// @ts-expect-error -- A Pointer of another schema is a type error.
	void Team.createOne({ data: { owner: { connect: Other.pointer('other') } } })
	// @ts-expect-error -- A required pointer cannot be null.
	void Team.updateOne({ where: { id: team.id }, data: { owner: null } })
	void Team.updateOne({
		where: { id: team.id },
		// @ts-expect-error -- `null` replaced `{ disconnect: true }`.
		data: { lead: { disconnect: true } },
	})
	void Team.updateOne({
		where: { id: team.id },
		// @ts-expect-error -- `{ set: [] }` replaced `{ clear: true }`.
		data: { members: { clear: true } },
	})
	void Team.updateOne({
		where: { id: team.id },
		// @ts-expect-error -- Relation targets keep the declared schema.
		data: { members: { connect: [Other.pointer('other')] } },
	})
	// @ts-expect-error -- Collection commands link but never nest.
	void Team.createMany({ data: [{ owner: { create: { name: 'Ada' } } }] })
	// @ts-expect-error -- Collection commands take links too.
	void Team.createMany({ data: [{ owner: Member.pointer('member-1') }] })
})
