import { MasterAuthority, Schema, UltimaBase } from '@ultimabase/core'

const AuditRecord = Schema.define({
	className: 'SecurityAuditRecord',
	fields: (field) => ({ message: field.string({ required: true }) }),
})

const masterAuthority = new MasterAuthority({
	keys: [{ id: 'maintenance', value: 'read-from-a-secret-store' }],
	onUse: (event) => {
		console.info(event.keyId, event.reason)
	},
})

export const ultimabase = new UltimaBase({
	masterAuthority,
	plugins: [],
	schemas: [AuditRecord],
})

await AuditRecord.createOne(
	{ data: { message: 'Rebuilt the search index' } },
	{ ultimabase, useMasterKey: true },
)
