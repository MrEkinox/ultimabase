import { ACL } from '@ultimabase/acl-permissions-plugin'
import { allOf } from '@ultimabase/access-plugin'
import { Schema } from '@ultimabase/core'
import { RoleSchema, hasRole } from '@ultimabase/roles-plugin'

import type {} from './.ultimabase/schema.generated.js'

export const Member = Schema.define({
	className: 'SecurityMember',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
})

export const AppRole = RoleSchema.define({
	className: 'SecurityRole',
	members: { schema: Member },
	fields: (field) => ({ description: field.string() }),
})

const editor = AppRole.role('editor')

export const Article = Schema.define({
	className: 'SecurityArticle',
	fields: (field) => ({
		internalNotes: field.string({ access: { read: false, write: false } }),
		owner: field.pointer({ required: true, target: 'SecurityMember' }),
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
	access: {
		create: true,
		delete: hasRole(editor),
		read: {
			allow: true,
			where: ({ where }) => where.eq('published', true),
		},
		update: {
			allow: allOf(true, hasRole(editor)),
			item: ({ item, originalItem }) => item.owner.id === originalItem.owner.id,
		},
	},
})

export const Document = Schema.define({
	className: 'SecurityDocument',
	fields: (field) => ({
		owner: field.pointer({ required: true, target: 'SecurityMember' }),
		title: field.string({ required: true }),
	}),
	acl: {
		default: ({ principal }) =>
			principal === undefined
				? new ACL()
				: new ACL().grantPrincipal(principal, 'read', 'update'),
	},
})
