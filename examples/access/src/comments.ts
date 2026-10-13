import { allOf, anyOf, not } from '@ultimabase/access-plugin'
import { isAuthenticated } from '@ultimabase/core'
import { hasRole } from '@ultimabase/roles-plugin'

import { Admin, App, Editor, Muted } from './schema.ts'

//#region comment
/**
 * `.softDelete()` adds request commands (`softDeleteOne`, `restoreOne`…) and
 * the `readDeleted` permission. Each has its own Access key: `update` and
 * `delete` grant none of them.
 */
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({
		author: field.string({ required: true }),
		body: field.string({ required: true }),
		pinned: field.boolean({ default: false }),
	}),
})
	.softDelete()
	.with({
		access: {
			read: true,
			// Authenticated members may comment unless they are muted.
			create: allOf(isAuthenticated, not(hasRole(Muted))),
			// Authors hide their own comments, except pinned ones.
			softDeleteOne: {
				where: ({ principal, where }) =>
					principal === undefined ? false : where.eq('author', principal.id),
				item: ({ originalItem }) => !originalItem.pinned,
			},
			restoreOne: anyOf(hasRole(Editor), hasRole(Admin)),
			// Editors also see hidden comments in ordinary reads.
			readDeleted: hasRole(Editor),
		},
	})
//#endregion comment
