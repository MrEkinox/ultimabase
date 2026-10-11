import { booleanField, stringField, UltimaBase } from '@ultimabase/core'
import type { PluginSourceState } from '@ultimabase/core/plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll } from 'vitest'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
export const relationTrace: string[] = []
export const rollbackError = new Error('relation mutation rollback fixture')
let rejectNextRelationUpdate = false
const RelationSchemaApplication =
	UltimaBase.use(accessPlugin()).use(hooksPlugin())
type RelationFieldBuilder = Parameters<
	Parameters<typeof RelationSchemaApplication.Schema.define>[0]['fields']
>[0]

/** Arms the next relation update rejection within this worker's fixture. */
export const rejectNextRelationMutation = (): void => {
	rejectNextRelationUpdate = true
}
export const tagLabelField = stringField({ required: true })
export const tagVisibleField = booleanField({ default: true })
export const articleTitleField = stringField({ required: true })
export const articleFields = (field: RelationFieldBuilder) => ({
	tags: field.relation({
		access: {
			read: () => {
				relationTrace.push('article:tags:read')
				return true
			},
			write: ({ change }) => {
				relationTrace.push(`article:tags:update:${change.action}`)
				return true
			},
		},
		target: 'RelationE2ETag',
	}),
	title: articleTitleField,
})

export const Article = RelationSchemaApplication.Schema.define({
	className: 'RelationE2EArticle',
	fields: articleFields,
	hooks: {
		afterOperation: {
			update: () => {
				// Relation links change through nested writes (ADR-0310), which run
				// beside the source update: the armed rejection targets the next
				// Article update, the link write under test.
				if (rejectNextRelationUpdate) {
					rejectNextRelationUpdate = false
					throw rollbackError
				}
			},
		},
	},
})

export const tagFields = (field: RelationFieldBuilder) => ({
	articles: field.relation({
		mappedBy: 'tags',
		target: 'RelationE2EArticle',
	}),
	label: tagLabelField,
	visible: tagVisibleField,
})

export const Tag = RelationSchemaApplication.Schema.define({
	className: 'RelationE2ETag',
	fields: tagFields,
	access: {
		read: ({ where }) => where.eq('visible', true),
	},
})

export const authorNameField = stringField({ required: true })
export const authorVisibleField = booleanField({ default: true })
export const postTitleField = stringField({ required: true })

export const authorFields = (field: RelationFieldBuilder) => ({
	name: authorNameField,
	posts: field.relation({ mappedBy: 'author', target: 'RelationE2EPost' }),
	visible: authorVisibleField,
})

export const Author = RelationSchemaApplication.Schema.define({
	className: 'RelationE2EAuthor',
	fields: authorFields,
	access: {
		read: ({ where }) => where.eq('visible', true),
	},
})

export const Post = RelationSchemaApplication.Schema.define({
	className: 'RelationE2EPost',
	fields: (field) => ({
		author: field.pointer({
			onDelete: 'setNull',
			target: 'RelationE2EAuthor',
		}),
		title: postTitleField,
	}),
})

export const privateArticleFields = (field: RelationFieldBuilder) => ({
	tags: field.relation({
		access: { read: false, write: true },
		target: 'RelationE2ETag',
	}),
	title: field.string({ required: true }),
})

export const PrivateArticle = RelationSchemaApplication.Schema.define({
	className: 'RelationE2EPrivateArticle',
	fields: privateArticleFields,
	access: {
		read: ({ where }) => where.some('tags', { visible: { eq: true } }),
	},
})

export const PrivatePointerPost = RelationSchemaApplication.Schema.define({
	className: 'RelationE2EPrivatePointerPost',
	fields: (field) => ({
		author: field.pointer({
			access: {
				read: { orderBy: true, output: true, where: false },
			},
			target: 'RelationE2EAuthor',
		}),
		title: field.string({ required: true }),
	}),
})

export const relationSchemas = [
	Article,
	Tag,
	Author,
	Post,
	PrivateArticle,
	PrivatePointerPost,
] as const

export let fixture: PostgresWorkerFixture | undefined
export let ultimabase:
	| UltimaBase<
			readonly [...typeof relationSchemas],
			readonly [ReturnType<typeof postgresPlugin>],
			PluginSourceState
	  >
	| undefined

export const getUltimaBase = () => {
	if (ultimabase === undefined) {
		throw new TypeError('Relation PostgreSQL application has not started')
	}
	return ultimabase
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new (UltimaBase.use(
		hooksPlugin(),
		accessPlugin({ allowWithoutRule: { all: true } }),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({
		schemas: relationSchemas,
		validation: {
			clock: () => new Date('2026-08-04T01:00:00.000Z'),
			timezone: 'UTC',
		},
	})
	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})
