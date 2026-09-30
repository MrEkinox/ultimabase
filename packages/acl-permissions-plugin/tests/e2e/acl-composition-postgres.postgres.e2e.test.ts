import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	RequestContext,
	RequestContextValue,
	UltimaBase,
	plugin,
	requestSources,
	type PluginSourceState,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { provideTestPrincipalResolver } from '../../../../tests/fixtures/access-capability-fixtures.js'
import { requireACLValue } from './acl-test-fixtures.js'

const ACLCompositionApplication = UltimaBase.use(accessPlugin())
	.use(hooksPlugin())
	.use(aclPlugin())

const PrincipalA = ACLCompositionApplication.Schema.define({
	className: 'ACLCompositionPrincipalA',
	fields: () => ({}),
})
const PrincipalB = ACLCompositionApplication.Schema.define({
	className: 'ACLCompositionPrincipalB',
	fields: () => ({}),
})
const principalId = new RequestContextValue<string>(
	'fixture.acl-composition.principal-id',
	(value: unknown): string => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('ACL composition principal id must be a string')
		}

		return value
	},
)
const principalSchema = new RequestContextValue<'a' | 'b'>(
	'fixture.acl-composition.principal-schema',
	(value: unknown): 'a' | 'b' => {
		if (value !== 'a' && value !== 'b') {
			throw new TypeError('ACL composition principal schema must be a or b')
		}

		return value
	},
)

const identityPlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.acl-composition.identity',
	contributions: [
		provideTestPrincipalResolver({
			resolveCurrent: ({ context }) => {
				const id = context.getValue(principalId)

				if (id === undefined) return undefined

				return context.getValue(principalSchema) === 'b'
					? PrincipalB.pointer(id)
					: PrincipalA.pointer(id)
			},
		}),
	],
})

const emptyACL = new ACL()
const Document = ACLCompositionApplication.Schema.define({
	className: 'ACLCompositionDocument',
	fields: (field) => ({
		hookScope: field.string({ default: 'allowed' }),
		nativeScope: field.string({ default: 'allowed' }),
		secret: field.string({ access: { read: false } }),
		title: field.string({
			hooks: {
				resolveInput: ({ value }) => value.trim().toLowerCase(),
			},
			required: true,
		}),
	}),
	acl: {
		default: ({ data, principal }) => {
			const initial =
				data.title === 'public' ? emptyACL.grantPublic('read') : emptyACL
			return principal === undefined
				? initial
				: initial.grantPrincipal(principal, 'read', 'update', 'delete')
		},
		// Returning undefined on create deliberately delegates to the configured default.
		resolveInput: ({ currentAcl, inputAcl }) => inputAcl ?? currentAcl,
	},
	postgres: { table: 'acl_composition_documents' },
	access: {
		create: true,
		delete: {
			allow: true,
			where: ({ where }) => where.eq('nativeScope', 'allowed'),
		},
		read: {
			allow: true,
			where: ({ where }) =>
				where.eq('nativeScope', 'allowed').eq('hookScope', 'allowed'),
		},
		update: {
			allow: true,
			where: ({ where }) => where.eq('nativeScope', 'allowed'),
		},
	},
})

const sharedPrincipalId = '0198a43e-2431-7000-8000-000000000610'
let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [typeof PrincipalA, typeof PrincipalB, typeof Document],
			readonly [
				typeof identityPlugin,
				ReturnType<typeof aclPlugin>,
				ReturnType<typeof postgresPlugin>,
			],
			PluginSourceState
	  >
	| undefined

const getApplication = (): NonNullable<typeof ultimabase> => {
	if (ultimabase === undefined) {
		throw new TypeError('ACL composition application has not started')
	}

	return ultimabase
}

const request = (
	requestId: string,
	schema: 'a' | 'b',
	id = sharedPrincipalId,
): RequestContext =>
	RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	})
		.withValue(principalId, id)
		.withValue(principalSchema, schema)

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new (UltimaBase.use(
		hooksPlugin(),
		accessPlugin({ default: true }),
		identityPlugin,
		aclPlugin(),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-composition-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: [PrincipalA, PrincipalB, Document],
	})
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe(
	'complete ACL composition with PostgreSQL',
	{ concurrent: false },
	() => {
		it('derives defaults from resolved input and the exact current principal', async () => {
			const app = getApplication()
			const alice = request('acl-composition-default', 'a')
			const owned = await Document.createOne(
				{ data: { secret: 'private', title: '  Owned  ' } },
				{ context: alice, ultimabase: app },
			)
			const publicDocument = await Document.createOne(
				{ data: { secret: 'public-secret', title: '  PUBLIC  ' } },
				{ ultimabase: app },
			)
			const persisted = await Document.findOne(
				{
					where: { id: { eq: owned.id } },
					select: { acl: true, title: true },
				},
				{ ultimabase: app, useMasterKey: true },
			)
			if (persisted === null) {
				throw new TypeError(
					'Expected the persisted document ACL to be materialized',
				)
			}
			const persistedACL = requireACLValue(
				persisted.acl,
				'Expected the persisted document ACL to be materialized',
			)

			expect(owned.title).toBe('owned')
			expect(owned).not.toHaveProperty('acl')
			expect(owned).not.toHaveProperty('secret')
			expect(persisted.title).toBe('owned')
			expect(persistedACL.toJSON()).toStrictEqual(
				new ACL()
					.grantPrincipal(
						PrincipalA.pointer(sharedPrincipalId),
						'read',
						'update',
						'delete',
					)
					.toJSON(),
			)
			await expect(
				Document.exists(
					{ where: { id: { eq: publicDocument.id } } },
					{ ultimabase: app },
				),
			).resolves.toBe(true)
		})

		it('keeps schema-qualified principals distinct while intersecting every SQL scope', async () => {
			const app = getApplication()
			const alice = request('acl-composition-a', 'a')
			const otherSchema = request('acl-composition-b', 'b')
			await Document.createMany(
				{
					data: [
						{
							acl: new ACL().grantPrincipal(
								PrincipalA.pointer(sharedPrincipalId),
								'read',
							),
							secret: 'a',
							title: 'principal-a',
						},
						{
							acl: new ACL().grantPrincipal(
								PrincipalB.pointer(sharedPrincipalId),
								'read',
							),
							secret: 'b',
							title: 'principal-b',
						},
						{
							acl: new ACL().grantPrincipal(
								PrincipalA.pointer(sharedPrincipalId),
								'read',
							),
							nativeScope: 'denied',
							secret: 'native',
							title: 'native-denied',
						},
						{
							acl: new ACL().grantPrincipal(
								PrincipalA.pointer(sharedPrincipalId),
								'read',
							),
							hookScope: 'denied',
							secret: 'hook',
							title: 'hook-denied',
						},
					],
				},
				{ ultimabase: app, useMasterKey: true },
			)

			const visibleTitles = (context: RequestContext) =>
				Document.findMany(
					{
						where: {
							title: {
								eq:
									context.getValue(principalSchema) === 'b'
										? 'principal-b'
										: 'principal-a',
							},
						},
						limit: 10,
						select: { title: true },
					},
					{ context, ultimabase: app },
				).then((rows) => rows.map(({ title }) => title))

			await expect(visibleTitles(alice)).resolves.toStrictEqual(['principal-a'])
			await expect(visibleTitles(otherSchema)).resolves.toStrictEqual([
				'principal-b',
			])
			await expect(
				Document.exists(
					{ where: { title: { eq: 'native-denied' } } },
					{ context: alice, ultimabase: app },
				),
			).resolves.toBe(false)
			await expect(
				Document.count(
					{ where: { title: { eq: 'hook-denied' } } },
					{ context: alice, ultimabase: app },
				),
			).resolves.toBe(0)
			await expect(
				Document.findMany(
					{ select: { secret: true } },
					{ context: alice, ultimabase: app },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				Document.findMany(
					{ select: { acl: true } },
					{ context: alice, ultimabase: app },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})
	},
)
