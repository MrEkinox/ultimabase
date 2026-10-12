import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { password, passwordOperations } from '@ultimabase/auth-password'
import {
	authOperations,
	authPlugin,
	authPrincipal,
} from '@ultimabase/auth-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

import type {} from '../.ultimabase/schema.generated.js'

const publicArticleACL = new ACL().grantPublic('delete', 'read', 'update')

/** Owns every source-typed schema declaration used by the example. */
export const MinimalSchemaApplication = UltimaBase.use(softDeletePlugin())
	// Opens every operation and command that a schema leaves without a rule,
	// production included; each schema below narrows its own (ADR-0317).
	.use(accessPlugin({ allowWithoutRule: { all: true } }))
	.use(hooksPlugin())
	.use(validationPlugin())
	.use(rolesPlugin())
	.use(aclPlugin())
	.use(
		// The authentication routes live under `/api/auth` (ADR-0326); browsers keep
		// the session in a secure cookie instead of reading its token.
		authPlugin({
			methods: [password()],
			http: { cookie: { name: '__Host-minimal-session', sameSite: 'lax' } },
		}),
	)
	.use(
		// Public operations are exposed by their owners (ADR-0324): REST keeps
		// the status operation; authentication is served under `/api/auth`.
		restPlugin({
			hide: [
				...Object.values(authOperations),
				...Object.values(passwordOperations),
			],
		}),
	)
	.use(
		// GraphQL exposes the authentication operations except two (ADR-0325).
		graphqlPlugin({
			hide: [
				passwordOperations.changePassword,
				authOperations.logoutEverywhere,
			],
		}),
	)

/** The User of `authPlugin`; `password()` adds the unique `username`. */
export const ExampleUser = MinimalSchemaApplication.UserSchema.define({
	className: 'ExampleUser',
}).with({
	// Each user reads only their own profile; no generated User CRUD.
	access: {
		read: ({ principal, where }) =>
			principal === undefined ? false : where.eq('id', principal.id),
	},
	graphql: false,
	rest: false,
})

/** The current member is the request principal Core resolves (ADR-0304). */
export const ExampleRole = MinimalSchemaApplication.RoleSchema.define({
	className: 'ExampleRole',
	members: () => ExampleUser,
	deletion: 'fail',
	fields: (field) => ({
		description: field.string(),
	}),
}).with({
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

/** Stores durable evidence from logical soft-delete lifecycle Hooks. */
export const ExampleSoftDeleteEvent = MinimalSchemaApplication.Schema.define({
	className: 'ExampleSoftDeleteEvent',
	fields: (field) => ({
		logicalOperation: field.string({ required: true }),
		persistenceEffect: field.enum({
			required: true,
			values: ['update', 'delete'],
		}),
		schemaName: field.string({ required: true }),
		targetId: field.string({ required: true }),
	}),
	access: {
		create: true,
		delete: false,
		read: false,
		update: false,
		upsert: false,
	},
	graphql: false,
	rest: false,
})

const recordSoftDeleteEvent = async (
	logicalOperation: 'delete' | 'purgeOne' | 'restoreOne' | 'softDeleteOne',
	persistenceEffect: 'delete' | 'update',
	schemaName: 'ExampleArticle' | 'ExampleAuthor',
	targetId: string,
): Promise<void> => {
	// The audit log is write-only (`read: false`): a write-only caller asks
	// for the identifier alone, the only result it may read (ADR-0306).
	await ExampleSoftDeleteEvent.createOne({
		data: { logicalOperation, persistenceEffect, schemaName, targetId },
		select: { id: true },
	})
}

/** Authors can be selected and included through both public transports. */
export const ExampleAuthor = MinimalSchemaApplication.Schema.define({
	className: 'ExampleAuthor',
	fields: (field) => ({
		articles: field.relation({
			mappedBy: 'author',
			target: 'ExampleArticle',
			where: { published: { eq: true } },
		}),
		audience: field.enum({
			default: 'public',
			values: ['authenticated', 'public'],
		}),
		contributions: field.relation({
			mappedBy: 'contributors',
			target: 'ExampleArticle',
			where: { published: { eq: true } },
		}),
		listed: field.boolean({ default: true }),
		name: field.string({ required: true, validation: z.string().min(1) }),
		readable: field.boolean({ default: true }),
	}),
	access: {
		read: ({ where }) => where.eq('readable', true),
		// Restoring stays server-side: Master bypasses Access.
		restoreOne: false,
		restoreMany: false,
	},
	graphql: true,
	hooks: {
		afterOperation: {
			delete: async ({ originalItem }) => {
				await recordSoftDeleteEvent(
					'delete',
					'update',
					'ExampleAuthor',
					originalItem.id,
				)
			},
			purgeOne: async ({ originalItem }) => {
				await recordSoftDeleteEvent(
					'purgeOne',
					'delete',
					'ExampleAuthor',
					originalItem.id,
				)
			},
			restoreOne: async ({ originalItem }) => {
				await recordSoftDeleteEvent(
					'restoreOne',
					'update',
					'ExampleAuthor',
					originalItem.id,
				)
			},
		},
	},
	rest: true,
	// `deleteOne` hides the author instead of deleting the row.
})
	.softDelete()
	.acl()
	.with({ acl: { default: publicArticleACL } })

/** Articles demonstrate policy, lifecycle, validation, and relationships. */
export const ExampleArticle = MinimalSchemaApplication.Schema.define({
	className: 'ExampleArticle',
	fields: (field) => ({
		author: field.pointer({ target: 'ExampleAuthor' }),
		contributors: field.relation({
			target: 'ExampleAuthor',
			where: { listed: { eq: true } },
		}),
		presentation: field.object({
			fields: (embedded) => ({
				subtitle: embedded.string(),
				tags: embedded.string({ list: true }),
			}),
		}),
		published: field.boolean({ default: true }),
		reviewers: field.relation({
			target: 'ExampleAuthor',
			where: ({ context, where }) =>
				context.getValue(authPrincipal) === undefined
					? where.eq('audience', 'public')
					: where,
		}),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({
			hooks: { resolveInput: ({ value }) => value.trim() },
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
				return context.getValue(authPrincipal) === undefined
					? `anonymous:${item.slug}`
					: `authenticated:${item.slug}`
			},
		}),
		authenticatedTitle: field.virtual({
			access: {
				read: {
					orderBy: false,
					output: isAuthenticated,
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
		read: ({ where }) => where.eq('published', true),
		update: true,
		upsert: true,
		softDeleteOne: isAuthenticated,
		// Restoring stays server-side: Master bypasses Access.
		restoreOne: false,
		restoreMany: false,
		softDeleteMany: false,
	},
	graphql: true,
	rest: true,
	hooks: {
		afterOperation: {
			delete: async ({ originalItem }) => {
				await recordSoftDeleteEvent(
					'delete',
					'delete',
					'ExampleArticle',
					originalItem.id,
				)
			},
			purgeOne: async ({ originalItem }) => {
				await recordSoftDeleteEvent(
					'purgeOne',
					'delete',
					'ExampleArticle',
					originalItem.id,
				)
			},
			restoreOne: async ({ originalItem }) => {
				await recordSoftDeleteEvent(
					'restoreOne',
					'update',
					'ExampleArticle',
					originalItem.id,
				)
			},
			softDeleteOne: async ({ originalItem }) => {
				await recordSoftDeleteEvent(
					'softDeleteOne',
					'update',
					'ExampleArticle',
					originalItem.id,
				)
			},
		},
	},
	// `deleteOne` stays physical; `softDeleteOne` hides the article.
})
	.softDelete({ mode: 'command' })
	.acl()
	.with({ acl: { default: publicArticleACL } })

/** Notes prove authenticated role-based Access and ACL through public CRUD. */
export const ExamplePrivateNote = MinimalSchemaApplication.Schema.define({
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
	graphql: true,
	rest: true,
})
	.acl()
	.with({ acl: { default: editorACL } })

export const minimalSchemas = [
	ExampleUser,
	ExampleAuthor,
	ExampleArticle,
	ExampleRole,
	ExamplePrivateNote,
	ExampleSoftDeleteEvent,
] as const
