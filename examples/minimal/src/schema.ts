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
	graphql: false,
})

export const ExampleEditorRole = ExampleRole.role('editor')
const editorAccess = hasRole(ExampleEditorRole)
const editorACL = new ACL().grantRole(
	ExampleEditorRole,
	'delete',
	'read',
	'update',
)

/** Authors can be selected and included through both public transports. */
export const ExampleAuthor = Schema.define({
	className: 'ExampleAuthor',
	fields: (field) => ({
		name: field.string({ required: true, validation: z.string().min(1) }),
	}),
	acl: { default: publicArticleACL },
	graphql: true,
	rest: true,
})

/** Articles demonstrate policy, lifecycle, validation, and relationships. */
export const ExampleArticle = Schema.define({
	className: 'ExampleArticle',
	fields: (field) => ({
		author: field.pointer({ target: 'ExampleAuthor' }),
		contributors: field.relation({ target: 'ExampleAuthor' }),
		presentation: field.object({
			fields: (embedded) => ({
				subtitle: embedded.string(),
				tags: embedded.string({ list: true }),
			}),
		}),
		published: field.boolean({ default: true }),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({
			hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
			required: true,
			validation: z.string().min(2).max(200),
		}),
		displayTitle: field.virtual({
			description: 'A display label derived from the persisted title.',
			output: (output) => output.string({ nullable: false }),
			select: { title: true },
			resolve: ({ item }) => {
				// @ts-expect-error -- Resolver items contain only declared dependencies.
				void item.slug
				return `Article: ${item.title}`
			},
		}),
		optionalSubtitle: field.virtual({
			output: (output) => output.string(),
			select: { presentation: true },
			resolve: ({ item }) => item.presentation?.subtitle ?? null,
		}),
		labels: field.virtual({
			output: (output) => output.string({ list: true, nullable: false }),
			select: { presentation: true },
			resolve: ({ item }) => item.presentation?.tags ?? [],
		}),
		summary: field.virtual({
			output: (output) =>
				output.object({
					fields: (output) => ({
						labels: output.string({ list: true, nullable: false }),
						subtitle: output.string(),
						title: output.string({ nullable: false }),
					}),
					nullable: false,
					typeName: 'ExampleArticleSummary',
				}),
			select: { presentation: true, title: true },
			resolve: async ({ item }) => {
				await Promise.resolve()
				return {
					labels: item.presentation?.tags ?? [],
					subtitle: item.presentation?.subtitle ?? null,
					title: item.title,
				}
			},
		}),
		viewerLabel: field.virtual({
			description:
				'A request-aware label that demonstrates context composition.',
			output: (output) => output.string({ nullable: false }),
			select: { slug: true },
			resolve: ({ context, item }) => {
				if (context.access.mode === 'master') return `master:${item.slug}`
				return context.getValue(passwordPrincipal) === undefined
					? `anonymous:${item.slug}`
					: `authenticated:${item.slug}`
			},
		}),
		authenticatedTitle: field.virtual({
			access: {
				read: {
					orderBy: false,
					output: ({ context }) =>
						context.getValue(passwordPrincipal) !== undefined,
					where: false,
				},
			},
			description:
				'A virtual field visible to authenticated requests and Master.',
			output: (output) => output.string({ nullable: false }),
			select: { title: true },
			resolve: ({ item }) => item.title,
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
	graphql: true,
	acl: {
		default: publicArticleACL,
		resolveInput: ({ currentAcl, inputAcl }) =>
			inputAcl ?? currentAcl ?? publicArticleACL,
	},
	rest: true,
})

/** Notes prove authenticated role-based Access and ACL through public CRUD. */
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
	graphql: true,
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
