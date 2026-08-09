import { aclPostgresPlugin } from '@ultimabase/acl-postgres-plugin'
import { ACL, acl, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	RequestContext,
	RequestContextValue,
	Schema,
	UltimaBase,
	accessPrincipalResolverServiceToken,
	definePlugin,
	requestSources,
} from '@ultimabase/core'
import { postgresPlugin, postgresTable } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const currentMemberId = new RequestContextValue<string>(
	'fixture.acl-relationships.member-id',
	(value: unknown): string => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('ACL relationship member id must be a string')
		}

		return value
	},
)
const Member = Schema.define({
	className: 'ACLRelationshipMember',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
	extensions: [postgresTable({ name: 'acl_relationship_members' })],
})
const identityPlugin = definePlugin({
	name: 'fixture.acl-relationships.identity',
	setup: ({ services }) => {
		services.provide(accessPrincipalResolverServiceToken, {
			resolveCurrent: ({ context }) => {
				const id = context.getValue(currentMemberId)

				return id === undefined ? undefined : Member.pointer(id)
			},
		})
	},
})
const emptyACL = new ACL()
const Author = Schema.define({
	className: 'ACLRelationshipAuthor',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
	extensions: [
		acl({
			default: emptyACL,
			resolveInput: ({ currentAcl, inputAcl }) =>
				inputAcl ?? currentAcl ?? emptyACL,
		}),
		postgresTable({ name: 'acl_relationship_authors' }),
	],
})
const Tag = Schema.define({
	className: 'ACLRelationshipTag',
	fields: (field) => ({
		label: field.string({ validation: { required: true } }),
	}),
	extensions: [
		acl({
			default: emptyACL,
			resolveInput: ({ currentAcl, inputAcl }) =>
				inputAcl ?? currentAcl ?? emptyACL,
		}),
		postgresTable({ name: 'acl_relationship_tags' }),
	],
})
const Article = Schema.define({
	className: 'ACLRelationshipArticle',
	fields: (field) => ({
		author: field.pointer({ target: () => Author }),
		tags: field.relation({ target: () => Tag }),
		title: field.string({ validation: { required: true } }),
	}),
	extensions: [
		acl({
			default: emptyACL,
			resolveInput: ({ currentAcl, inputAcl }) =>
				inputAcl ?? currentAcl ?? emptyACL,
		}),
		postgresTable({ name: 'acl_relationship_articles' }),
	],
})

type PersistedMember = Awaited<
	ReturnType<InstanceType<typeof Member>['create']>
>
type PersistedAuthor = Awaited<
	ReturnType<InstanceType<typeof Author>['create']>
>
type PersistedTag = Awaited<ReturnType<InstanceType<typeof Tag>['create']>>
type PersistedArticle = Awaited<
	ReturnType<InstanceType<typeof Article>['create']>
>

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [typeof Member, typeof Author, typeof Tag, typeof Article],
			readonly [
				typeof identityPlugin,
				ReturnType<typeof aclPlugin>,
				ReturnType<typeof postgresPlugin>,
				ReturnType<typeof aclPostgresPlugin>,
			]
	  >
	| undefined
let alice: PersistedMember | undefined
let visibleAuthor: PersistedAuthor | undefined
let hiddenAuthor: PersistedAuthor | undefined
let visibleTag: PersistedTag | undefined
let hiddenTag: PersistedTag | undefined
let visibleArticle: PersistedArticle | undefined
let hiddenArticle: PersistedArticle | undefined

const requireFixture = <TValue>(
	value: TValue | undefined,
	label: string,
): TValue => {
	if (value === undefined) {
		throw new TypeError(`Missing ACL relationship fixture: ${label}`)
	}

	return value
}

const getApplication = (): NonNullable<typeof ultimabase> =>
	requireFixture(ultimabase, 'application')

const aliceRequest = (requestId: string): RequestContext =>
	RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	}).withValue(currentMemberId, requireFixture(alice, 'alice').id)

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-relationships-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			identityPlugin,
			aclPlugin(),
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
			aclPostgresPlugin(),
		],
		schemas: [Member, Author, Tag, Article],
	})
	await ultimabase.start()
	const app = getApplication()

	alice = await Member.createOne(
		{ data: { name: 'Alice' } },
		{ ultimabase: app, useMasterKey: true },
	)
	const alicePointer = Member.pointer(alice.id)
	const readACL = new ACL().grantPrincipal(alicePointer, 'read')
	const editableACL = readACL.grantPrincipal(alicePointer, 'update')

	;[visibleAuthor, hiddenAuthor] = await Author.createMany(
		{
			data: [
				{ acl: readACL, name: 'Visible author' },
				{ acl: emptyACL, name: 'Hidden author' },
			],
		},
		{ ultimabase: app, useMasterKey: true },
	)
	;[visibleTag, hiddenTag] = await Tag.createMany(
		{
			data: [
				{ acl: readACL, label: 'visible' },
				{ acl: emptyACL, label: 'hidden' },
			],
		},
		{ ultimabase: app, useMasterKey: true },
	)
	;[visibleArticle, , hiddenArticle] = await Article.createMany(
		{
			data: [
				{
					acl: editableACL,
					author: Author.pointer(requireFixture(visibleAuthor, 'author').id),
					title: 'Visible article',
				},
				{
					acl: readACL,
					author: Author.pointer(
						requireFixture(hiddenAuthor, 'hidden author').id,
					),
					title: 'Hidden author article',
				},
				{
					acl: emptyACL,
					author: Author.pointer(requireFixture(visibleAuthor, 'author').id),
					title: 'Hidden article',
				},
			],
		},
		{ ultimabase: app, useMasterKey: true },
	)

	await requireFixture(visibleArticle, 'visible article')
		.relation('tags')
		.connect(
			[
				Tag.pointer(requireFixture(visibleTag, 'visible tag').id),
				Tag.pointer(requireFixture(hiddenTag, 'hidden tag').id),
			],
			{ ultimabase: app, useMasterKey: true },
		)
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe(
	'ACL relationship paths with PostgreSQL',
	{ concurrent: false },
	() => {
		it('uses target ACL constraints for pointer queries and inclusion', async () => {
			const app = getApplication()
			const context = aliceRequest('acl-relationships-pointers')
			const rows = await Article.findMany(
				{
					orderBy: { title: 'asc' },
					include: { author: { select: { name: true } } },
				},
				{ context, ultimabase: app },
			)

			expect(rows.map(({ title }) => title)).toStrictEqual([
				'Hidden author article',
				'Visible article',
			])
			expect(rows[0]?.author).toBeNull()
			expect(rows[1]?.author?.toJSON()).toStrictEqual({
				name: 'Visible author',
			})
			await expect(
				Author.pointer(
					requireFixture(hiddenAuthor, 'hidden author').id,
				).findOne(undefined, { context, ultimabase: app }),
			).resolves.toBeNull()
			const protectedInclusion = await Article.findMany(
				{ include: { author: { select: { acl: true } } } },
				{ context, ultimabase: app },
			)

			// A forbidden target projection is indistinguishable from a missing pointer.
			expect(protectedInclusion.every(({ author }) => author === null)).toBe(
				true,
			)
			await expect(
				Article.findMany(
					{ select: { acl: true } },
					{ context, ultimabase: app },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})

		it('keeps relation reads and mutations inside source and target ACLs', async () => {
			const app = getApplication()
			const context = aliceRequest('acl-relationships-relations')
			const article = requireFixture(visibleArticle, 'visible article')
			const tags = article.relation('tags')

			await expect(
				tags.findMany(
					{ cursor: true, limit: 10, select: { label: true } },
					{ context, ultimabase: app },
				),
			).resolves.toEqual([expect.objectContaining({ label: 'visible' })])
			await expect(tags.count({}, { context, ultimabase: app })).resolves.toBe(
				1,
			)
			await expect(tags.exists({}, { context, ultimabase: app })).resolves.toBe(
				true,
			)
			await expect(
				tags.findMany({ select: { acl: true } }, { context, ultimabase: app }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				requireFixture(hiddenArticle, 'hidden article')
					.relation('tags')
					.findMany(undefined, { context, ultimabase: app }),
			).resolves.toStrictEqual([])
			await expect(
				tags.connect(Tag.pointer(requireFixture(hiddenTag, 'hidden tag').id), {
					context,
					ultimabase: app,
				}),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
		})
	},
)
