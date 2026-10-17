import { ACL } from '@ultimabase/acl-permissions-plugin'
import { authPrincipal } from '@ultimabase/auth-plugin'
import { isAuthenticated } from '@ultimabase/core'
import { hasRole } from '@ultimabase/roles-plugin'
import { z } from 'zod'

import { App } from './app.ts'
import { readPresentation, readText } from './stored-values.ts'

const publicArticleACL = new ACL().grantPublic('delete', 'read', 'update')

/** The User of `authPlugin`; `password()` adds the unique `username`. */
export const ExampleUser = App.UserSchema.define({
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
export const ExampleRole = App.RoleSchema.define({
	className: 'ExampleRole',
	members: () => ExampleUser,
	fields: (field) => ({
		description: field.string(),
	}),
}).with({
	roles: { deletion: 'fail' },
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
export const ExampleSoftDeleteEvent = App.Schema.define({
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
}).with({
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
export const ExampleAuthor = App.Schema.define({
	className: 'ExampleAuthor',
	fields: (field) => ({
		articles: field.relation({
			mappedBy: 'author',
			target: () => ExampleArticle,
		}),
		audience: field.enum({
			default: 'public',
			values: ['authenticated', 'public'],
		}),
		contributions: field.relation({
			mappedBy: 'contributors',
			target: () => ExampleArticle,
		}),
		listed: field.boolean({ default: true }),
		name: field.string({ required: true, validation: z.string().min(1) }),
		readable: field.boolean({ default: true }),
	}),
	// `deleteOne` hides the author instead of deleting the row.
	softDelete: true,
	acl: true,
}).with({
	access: {
		read: ({ where }) => where.eq('readable', true),
		// Restoring stays server-side: Master bypasses Access.
		restoreOne: false,
		restoreMany: false,
	},
	acl: { default: publicArticleACL },
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
	// Relation filters are typed against the complete target, so both
	// schemas filter each other's relations (ADR-0328).
	relations: {
		articles: { where: { published: { eq: true } } },
		contributions: { where: ({ where }) => where.eq('published', true) },
	},
	rest: true,
})

/** Articles demonstrate policy, lifecycle, validation, and relationships. */
export const ExampleArticle = App.Schema.define({
	className: 'ExampleArticle',
	fields: (field) => ({
		author: field.pointer({ target: () => ExampleAuthor }),
		contributors: field.relation({ target: () => ExampleAuthor }),
		presentation: field.object({
			fields: (embedded) => ({
				subtitle: embedded.string(),
				tags: embedded.string({ list: true }),
			}),
		}),
		published: field.boolean({ default: true }),
		reviewers: field.relation({ target: () => ExampleAuthor }),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({
			hooks: { resolveInput: ({ value }) => value.trim() },
			required: true,
			validation: z.string().min(2).max(200),
		}),
		displayTitle: field.virtual({
			description: 'A display label derived from the persisted title.',
			output: (output) => output.string(),
			select: { title: true },
			resolve: ({ item }) => {
				// @ts-expect-error -- Resolver items contain only declared dependencies.
				void item.slug
				return `Article: ${readText(item.title)}`
			},
		}),
		optionalSubtitle: field.virtual({
			output: (output) => output.string({ required: false }),
			select: { presentation: true },
			resolve: ({ item }) => readPresentation(item.presentation).subtitle,
		}),
		labels: field.virtual({
			output: (output) => output.string({ list: true }),
			select: { presentation: true },
			resolve: ({ item }) => readPresentation(item.presentation).tags,
		}),
		summary: field.virtual({
			output: (output) =>
				output.object({
					fields: (output) => ({
						labels: output.string({ list: true }),
						subtitle: output.string({ required: false }),
						title: output.string(),
					}),
					typeName: 'ExampleArticleSummary',
				}),
			select: { presentation: true, title: true },
			resolve: async ({ item }) => {
				await Promise.resolve()
				const { subtitle, tags } = readPresentation(item.presentation)
				return { labels: tags, subtitle, title: readText(item.title) }
			},
		}),
		viewerLabel: field.virtual({
			description:
				'A request-aware label that demonstrates context composition.',
			output: (output) => output.string(),
			select: { slug: true },
			resolve: ({ context, item }) => {
				const slug = readText(item.slug)
				if (context.access.mode === 'master') return `master:${slug}`
				return context.getValue(authPrincipal) === undefined
					? `anonymous:${slug}`
					: `authenticated:${slug}`
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
			output: (output) => output.string(),
			select: { title: true },
			resolve: ({ item }) => readText(item.title),
		}),
	}),
	// `deleteOne` stays physical; `softDeleteOne` hides the article.
	softDelete: { mode: 'command' },
	acl: true,
}).with({
	//#region relation-views
	// Narrows every read through these relation fields (ADR-0328).
	relations: {
		contributors: { where: { listed: { eq: true } } },
		// Anonymous requests see only public reviewers.
		reviewers: {
			where: ({ context, where }) =>
				context.getValue(authPrincipal) === undefined
					? where.eq('audience', 'public')
					: where,
		},
	},
	//#endregion relation-views
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
	acl: { default: publicArticleACL },
	graphql: true,
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
	rest: true,
})

/** Notes prove authenticated role-based Access and ACL through public CRUD. */
export const ExamplePrivateNote = App.Schema.define({
	className: 'ExamplePrivateNote',
	fields: (field) => ({
		body: field.string({ required: true }),
	}),
	acl: true,
}).with({
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

/** Every schema of the application, registered in `ultimabase.ts`. */
export const schemas = [
	ExampleUser,
	ExampleAuthor,
	ExampleArticle,
	ExampleRole,
	ExamplePrivateNote,
	ExampleSoftDeleteEvent,
] as const
