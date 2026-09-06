import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { Schema } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	PasswordUser,
	passwordPrincipal,
} from '@ultimabase/password-auth-plugin'
import { RoleSchema, hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

import type {} from '../.ultimabase/schema.generated.js'

const publicArticleACL = new ACL().grantPublic('delete', 'read', 'update')

/** The exact User schema contributed by the configured Password Auth plugin. */
export const ExampleUser = PasswordUser

/** Resolves Password Auth identities into the example's independent role domain. */
export const ExampleRole = RoleSchema.define({
	className: 'ExampleRole',
	members: {
		schema: PasswordUser,
		resolveCurrent: ({ context }) => context.getValue(passwordPrincipal)?.user,
	},
	deletion: { references: 'fail' },
	fields: (field) => ({
		description: field.string(),
	}),
	access: {
		create: false,
		delete: false,
		read: true,
		update: false,
	},
})

export const ExampleEditorRole = ExampleRole.role('editor')
const editorAccess = hasRole(ExampleEditorRole)
const editorACL = new ACL().grantRole(
	ExampleEditorRole,
	'delete',
	'read',
	'update',
)

/** Authors can be selected and included through the public REST graph. */
export const ExampleAuthor = Schema.define({
	className: 'ExampleAuthor',
	fields: (field) => ({
		name: field.string({ required: true, validation: z.string().min(1) }),
	}),
	acl: { default: publicArticleACL },
	rest: true,
})

/** Articles demonstrate policy, lifecycle, validation, and relationships. */
export const ExampleArticle = Schema.define({
	className: 'ExampleArticle',
	fields: (field) => ({
		author: field.pointer({ target: 'ExampleAuthor' }),
		contributors: field.relation({ target: 'ExampleAuthor' }),
		published: field.boolean({ default: true }),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({
			hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
			required: true,
			validation: z.string().min(2).max(200),
		}),
	}),
	access: {
		create: true,
		delete: true,
		read: {
			allow: { count: true, exists: true, many: true, one: true },
			where: ({ where }) => where.eq('published', true),
		},
		update: true,
		upsert: true,
	},
	acl: {
		default: publicArticleACL,
		resolveInput: ({ currentAcl, inputAcl }) =>
			inputAcl ?? currentAcl ?? publicArticleACL,
	},
	rest: true,
})

/** Notes prove authenticated role-based Access and ACL through public REST CRUD. */
export const ExamplePrivateNote = Schema.define({
	className: 'ExamplePrivateNote',
	fields: (field) => ({
		body: field.string({ required: true }),
	}),
	access: {
		create: editorAccess,
		delete: editorAccess,
		read: editorAccess,
		update: editorAccess,
	},
	acl: { default: editorACL },
	rest: true,
})

/** Keeps the schema-owning optional plugins explicit and independently removable. */
export const minimalBehaviorPlugins = [
	accessPlugin({ default: true }),
	hooksPlugin(),
	validationPlugin(),
	rolesPlugin(),
	aclPlugin(),
] as const

export const minimalSchemas = [
	ExampleAuthor,
	ExampleArticle,
	ExampleRole,
	ExamplePrivateNote,
] as const
