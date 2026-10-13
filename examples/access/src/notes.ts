import { isAuthenticated } from '@ultimabase/core'
import { hasRole } from '@ultimabase/roles-plugin'

import { Admin, App } from './schema.ts'

//#region note
/** Private notes: members write their own, and only their author reads them. */
export const Note = App.Schema.define({
	className: 'Note',
	fields: (field) => ({
		author: field.string({ required: true }),
		body: field.string({ required: true }),
	}),
}).with({
	access: {
		read: ({ principal, where }) =>
			principal === undefined ? false : where.eq('author', principal.id),
		create: {
			// Nothing is loaded before a create: `where` is a decision.
			where: isAuthenticated,
			item: ({ item, principal }) => item.author === principal?.id,
		},
		update: {
			where: ({ principal }) => principal !== undefined,
			item: ({ item, originalItem, principal }) =>
				originalItem.author === principal?.id &&
				item.author === originalItem.author,
		},
		delete: hasRole(Admin),
	},
})
//#endregion note

//#region audit-entry
/** Write-only: any caller appends entries, only Master reads them. */
export const AuditEntry = App.Schema.define({
	className: 'AuditEntry',
	fields: (field) => ({ action: field.string({ required: true }) }),
}).with({ access: { create: true, read: false } })
//#endregion audit-entry
