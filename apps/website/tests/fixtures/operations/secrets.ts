import { MasterAuthority } from '@ultimabase/core'

const masterKey = process.env.ULTIMABASE_MASTER_KEY
if (masterKey === undefined)
	throw new TypeError('ULTIMABASE_MASTER_KEY is required')

export const masterAuthority = new MasterAuthority({
	keys: [{ id: 'primary', value: masterKey }],
	onUse: async (event) => {
		await recordMasterAudit(event)
	},
})

declare const recordMasterAudit: (event: Readonly<object>) => Promise<void>
