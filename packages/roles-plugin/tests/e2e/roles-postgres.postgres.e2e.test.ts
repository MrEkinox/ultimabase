import { runWithRequestEngine, type OperationOptions } from '@ultimabase/core'
import { resolveRoleReference } from '@ultimabase/roles-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	AppRole,
	CascadeRole,
	EditorReference,
	ExternalRoleReference,
	FailRole,
	MissingProviderPost,
	PreserveRole,
	ProtectedPost,
	RoleMember,
	committedRoleEvents,
	createProviderBoundaryApplication,
	createRoleApplication,
	masterRoleAccessReasons,
	missingProviderHookCalls,
	rejectNextRoleReferenceCleanup,
	resetMissingProviderHookCalls,
	roleDeveloperHookTrace,
	roleResolverConsumerPluginName,
	roleResolutionTrace,
} from './roles-postgres.fixture.js'

import {
	countRoleLinks,
	createExternalReference,
	createMemberContext,
	masterOptions,
	requireMember,
	requireRole,
	requireRoleResolver,
	updateAppRole,
	type PersistedAppRole,
	type PersistedMember,
} from './roles-postgres.helpers.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

type RoleApplication = ReturnType<typeof createRoleApplication>

let fixture: PostgresWorkerFixture | undefined
let ultimabase: RoleApplication | undefined
let alice: PersistedMember | undefined
let bob: PersistedMember | undefined
let editor: PersistedAppRole | undefined
let publisher: PersistedAppRole | undefined
let reviewer: PersistedAppRole | undefined
let administrator: PersistedAppRole | undefined
let publishedPostId = ''
let privatePostId = ''

const getApplication = (): RoleApplication => {
	if (ultimabase === undefined) {
		throw new TypeError('Role PostgreSQL application has not started')
	}

	return ultimabase
}

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('Role PostgreSQL fixture has not started')
	}

	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = createRoleApplication(fixture.connectionUri)
	await ultimabase.start()

	;[alice, bob] = await RoleMember.createMany({
		data: [{ email: 'alice@example.test' }, { email: 'bob@example.test' }],
	})

	editor = await AppRole.createOne(
		{
			data: {
				description: 'Can edit content',
				name: '  EDITOR  ',
				priority: 10,
			},
		},
		masterOptions,
	)
	publisher = await AppRole.createOne(
		{ data: { name: 'publisher', priority: 20 } },
		masterOptions,
	)
	reviewer = await AppRole.createOne(
		{ data: { name: 'reviewer', priority: 30 } },
		masterOptions,
	)
	administrator = await AppRole.createOne(
		{
			data: {
				description: 'Inherited administration',
				name: 'administrator',
				priority: 40,
			},
		},
		masterOptions,
	)

	await updateAppRole(requireRole(editor, 'editor').id, {
		members: { connect: [requireMember(alice, 'Alice').id] },
	})
	await updateAppRole(requireRole(publisher, 'publisher').id, {
		roles: { connect: [requireRole(editor, 'editor').id] },
	})
	await updateAppRole(requireRole(reviewer, 'reviewer').id, {
		roles: { connect: [requireRole(editor, 'editor').id] },
	})
	await updateAppRole(requireRole(administrator, 'administrator').id, {
		roles: { connect: [requireRole(publisher, 'publisher').id] },
	})
	await updateAppRole(requireRole(administrator, 'administrator').id, {
		roles: { connect: [requireRole(reviewer, 'reviewer').id] },
	})

	const posts = await ProtectedPost.createMany(
		{
			data: [
				{
					internalNote: 'visible to administrators',
					published: true,
					title: 'Public role post',
				},
				{
					internalNote: 'hidden by the read filter',
					published: false,
					title: 'Private role post',
				},
			],
		},
		masterOptions,
	)
	publishedPostId = posts[0]?.id ?? ''
	privatePostId = posts[1]?.id ?? ''
}, 60_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('stored roles with PostgreSQL', { concurrent: false }, () => {
	it('preserves ordinary schema, model, Query, relation, hook, and event behavior', async () => {
		const currentEditor = requireRole(editor, 'editor')
		const currentBob = requireMember(bob, 'Bob')

		expect(currentEditor.name).toBe('editor')
		expect(currentEditor.description).toBe('Can edit content')
		expect(currentEditor.priority).toBe(10)

		const selected = await AppRole.findMany(
			{
				where: { priority: { gte: 10 } },
				orderBy: { priority: 'asc' },
				select: { id: true, name: true, priority: true },
			},
			masterOptions,
		)

		expect(selected).toStrictEqual([
			{ id: currentEditor.id, name: 'editor', priority: 10 },
			{
				id: requireRole(publisher, 'publisher').id,
				name: 'publisher',
				priority: 20,
			},
			{
				id: requireRole(reviewer, 'reviewer').id,
				name: 'reviewer',
				priority: 30,
			},
			{
				id: requireRole(administrator, 'administrator').id,
				name: 'administrator',
				priority: 40,
			},
		])

		roleDeveloperHookTrace.length = 0
		const updated = await updateAppRole(currentEditor.id, {
			description: 'Edits published content',
		})
		expect(updated?.description).toBe('Edits published content')
		expect(roleDeveloperHookTrace).toContain('update-one')

		const eventCount = committedRoleEvents.length
		await updateAppRole(currentEditor.id, {
			members: { connect: [currentBob.id] },
		})
		await updateAppRole(currentEditor.id, {
			members: { connect: [currentBob.id] },
		})
		expect(await countRoleLinks(currentEditor.id, 'members')).toBe(2)
		await updateAppRole(currentEditor.id, {
			members: { disconnect: [currentBob.id] },
		})
		expect(await countRoleLinks(currentEditor.id, 'members')).toBe(1)

		const temporaryChild = await AppRole.createOne(
			{
				data: {
					name: 'temporary-child',
				},
			},
			masterOptions,
		)
		await updateAppRole(currentEditor.id, {
			roles: { connect: [temporaryChild.id] },
		})
		await expect(countRoleLinks(currentEditor.id, 'roles')).resolves.toBe(1)
		await updateAppRole(currentEditor.id, {
			roles: { disconnect: [temporaryChild.id] },
		})
		await expect(countRoleLinks(currentEditor.id, 'roles')).resolves.toBe(0)
		expect(committedRoleEvents.slice(eventCount)).toContain(
			'ultimabase.roles.membership.changed',
		)
		expect(committedRoleEvents.slice(eventCount)).toContain(
			'ultimabase.roles.hierarchy.changed',
		)
		expect(masterRoleAccessReasons.length).toBeGreaterThan(0)
	})

	it('resolves direct and diamond-inherited roles once per request', async () => {
		const aliceContext = createMemberContext(
			requireMember(alice, 'Alice').id,
			'roles-e2e-alice-update',
		)
		const bobContext = createMemberContext(
			requireMember(bob, 'Bob').id,
			'roles-e2e-bob-update',
		)

		roleResolutionTrace.length = 0
		const updated = await ProtectedPost.updateOne(
			{
				where: { id: { eq: publishedPostId } },
				data: { title: 'Updated through inherited roles' },
			},
			{ context: aliceContext },
		)

		expect(updated?.internalNote).toBe('visible to administrators')
		// Operation and field Access share one request-local membership resolution.
		expect(roleResolutionTrace).toStrictEqual(['resolve-current'])
		await expect(
			ProtectedPost.updateOne(
				{
					where: { id: { eq: publishedPostId } },
					data: { title: 'Bob must not update' },
				},
				{ context: bobContext },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

		const visible = await ProtectedPost.findMany(
			{ select: { id: true, internalNote: true, title: true } },
			{ context: aliceContext },
		)
		expect(visible).toHaveLength(1)
		expect(visible[0]?.id).toBe(publishedPostId)
		await expect(
			ProtectedPost.exists(
				{ where: { id: { eq: privatePostId } } },
				{ context: aliceContext },
			),
		).resolves.toBe(false)

		const deletable = await ProtectedPost.createOne(
			{ data: { published: true, title: 'Role-protected deletion' } },
			masterOptions,
		)
		await expect(
			ProtectedPost.deleteOne(
				{ where: { id: { eq: deletable.id } } },
				{ context: aliceContext },
			),
		).resolves.toMatchObject({ id: deletable.id })

		roleResolutionTrace.length = 0
		await ProtectedPost.updateOne(
			{
				where: { id: { eq: publishedPostId } },
				data: {
					title: 'A second terminal gets a fresh role snapshot',
				},
			},
			{ context: aliceContext },
		)
		expect(roleResolutionTrace).toStrictEqual(['resolve-current'])
	})

	it('rolls back indirect hierarchy cycles without publishing an event', async () => {
		const currentEditor = requireRole(editor, 'editor')
		const eventCount = committedRoleEvents.length

		await expect(
			updateAppRole(currentEditor.id, {
				roles: {
					connect: [requireRole(administrator, 'administrator').id],
				},
			}),
		).rejects.toMatchObject({ code: 'ROLE_HIERARCHY_CYCLE' })
		await expect(countRoleLinks(currentEditor.id, 'roles')).resolves.toBe(0)
		expect(committedRoleEvents).toHaveLength(eventCount)
	})

	it('keeps UUID references stable across role renames', async () => {
		const app = getApplication()
		const currentEditor = requireRole(editor, 'editor')
		const stableReference = AppRole.role({ id: currentEditor.id })
		const renamed = await updateAppRole(currentEditor.id, {
			name: 'content-editor',
		})

		expect(renamed?.name).toBe('content-editor')
		await expect(resolveRoleReference(stableReference)).resolves.toMatchObject({
			id: currentEditor.id,
			name: 'content-editor',
		})
		await expect(resolveRoleReference(EditorReference)).rejects.toMatchObject({
			code: 'ROLE_REFERENCE_UNKNOWN',
		})

		const context = createMemberContext(
			requireMember(alice, 'Alice').id,
			'roles-e2e-stable-reference',
		)
		const request = app.withContext(context)
		const resolver = requireRoleResolver(
			app.plugin(roleResolverConsumerPluginName),
		)

		await expect(
			runWithRequestEngine(request, () =>
				resolver.hasRole({ context, role: stableReference }),
			),
		).resolves.toBe(true)
	})

	it('links members and included roles through connect (ADR-0308)', async () => {
		const app = getApplication()
		const master = { useMasterKey: true } as const
		const member = await RoleMember.createOne(
			{ data: { email: 'linked@example.test' } },
			master,
		)
		const eventCount = committedRoleEvents.length
		const linked = await AppRole.createOne(
			{
				data: {
					members: { connect: [RoleMember.pointer(member.id)] },
					name: 'linked',
				},
			},
			master,
		)
		const context = createMemberContext(member.id, 'roles-e2e-linked')
		const resolver = requireRoleResolver(
			app.plugin(roleResolverConsumerPluginName),
		)
		const hasLinkedRole = () =>
			runWithRequestEngine(app.withContext(context), () =>
				resolver.hasRole({ context, role: AppRole.role('linked') }),
			)

		await expect(hasLinkedRole()).resolves.toBe(true)
		expect(committedRoleEvents.slice(eventCount)).toContain(
			'ultimabase.roles.membership.changed',
		)
		// The hierarchy invariant applies to included roles linked by `connect`.
		await expect(
			AppRole.updateOne(
				{
					where: { id: requireRole(editor, 'editor').id },
					data: {
						roles: {
							connect: [requireRole(administrator, 'administrator').id],
						},
					},
				},
				master,
			),
		).rejects.toMatchObject({ code: 'ROLE_HIERARCHY_CYCLE' })
		await AppRole.updateOne(
			{ where: { id: linked.id }, data: { members: { set: [] } } },
			master,
		)
		await expect(hasLinkedRole()).resolves.toBe(false)
	})

	it('enforces fail, preserve, and cascade deletion policies atomically', async () => {
		const currentAlice = requireMember(alice, 'Alice')
		const failRole = await FailRole.createOne(
			{ data: { name: 'fail-policy' } },
			masterOptions,
		)
		await FailRole.updateOne(
			{
				where: { id: { eq: failRole.id } },
				data: {
					members: { connect: [currentAlice.id] },
				},
			},
			masterOptions,
		)
		await expect(
			FailRole.deleteOne({ where: { id: { eq: failRole.id } } }, masterOptions),
		).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })
		await FailRole.updateOne(
			{
				where: { id: { eq: failRole.id } },
				data: {
					members: { disconnect: [currentAlice.id] },
				},
			},
			masterOptions,
		)
		const failReference = FailRole.role({ id: failRole.id })
		await createExternalReference(failReference)
		await expect(
			FailRole.deleteOne({ where: { id: { eq: failRole.id } } }, masterOptions),
		).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })
		const externalReferences = await ExternalRoleReference.findMany({
			where: { subject: { eq: failReference.value } },
			select: { id: true },
		})
		await ExternalRoleReference.deleteMany({
			where: externalReferences.map(({ id }) => ({ id: { eq: id } })),
		})
		await expect(
			FailRole.deleteOne({ where: { id: { eq: failRole.id } } }, masterOptions),
		).resolves.toMatchObject({ id: failRole.id })

		const preserveRole = await PreserveRole.createOne(
			{
				data: {
					name: 'preserve-policy',
				},
			},
			masterOptions,
		)
		const preserveReference = PreserveRole.role({
			id: preserveRole.id,
		})
		await createExternalReference(preserveReference)
		await expect(
			PreserveRole.deleteOne({ where: { id: { eq: preserveRole.id } } }),
		).resolves.toMatchObject({ id: preserveRole.id })
		await expect(
			ExternalRoleReference.exists({
				where: { subject: { eq: preserveReference.value } },
			}),
		).resolves.toBe(true)

		const cascadeChild = await CascadeRole.createOne(
			{
				data: {
					name: 'cascade-child',
				},
			},
			masterOptions,
		)
		const cascadeParent = await CascadeRole.createOne(
			{
				data: {
					name: 'cascade-parent',
				},
			},
			masterOptions,
		)
		await CascadeRole.updateOne(
			{
				where: { id: { eq: cascadeChild.id } },
				data: {
					members: { connect: [currentAlice.id] },
				},
			},
			masterOptions,
		)
		await CascadeRole.updateOne(
			{
				where: { id: { eq: cascadeParent.id } },
				data: {
					roles: { connect: [cascadeChild.id] },
				},
			},
			masterOptions,
		)
		const cascadeReference = CascadeRole.role({
			id: cascadeChild.id,
		})
		await createExternalReference(cascadeReference)
		await expect(
			CascadeRole.deleteOne({ where: { id: { eq: cascadeChild.id } } }),
		).rejects.toMatchObject({
			code: 'ROLE_DELETE_CASCADE_MASTER_REQUIRED',
		})
		await expect(
			CascadeRole.deleteOne(
				{ where: { id: { eq: cascadeChild.id } } },
				masterOptions,
			),
		).resolves.toMatchObject({ id: cascadeChild.id })
		await expect(
			CascadeRole.count(
				{ where: { id: { eq: cascadeParent.id }, roles: { some: {} } } },
				masterOptions,
			),
		).resolves.toBe(0)
		await expect(
			ExternalRoleReference.exists({
				where: { subject: { eq: cascadeReference.value } },
			}),
		).resolves.toBe(false)

		const rollbackRole = await CascadeRole.createOne(
			{
				data: {
					name: 'cascade-rollback',
				},
			},
			masterOptions,
		)
		const rollbackReference = CascadeRole.role({
			id: rollbackRole.id,
		})
		await createExternalReference(rollbackReference)
		rejectNextRoleReferenceCleanup()
		await expect(
			CascadeRole.deleteOne(
				{ where: { id: { eq: rollbackRole.id } } },
				masterOptions,
			),
		).rejects.toThrow('external role cleanup rollback fixture')
		await expect(
			CascadeRole.exists({ where: { id: { eq: rollbackRole.id } } }),
		).resolves.toBe(true)
		await expect(
			ExternalRoleReference.exists({
				where: { subject: { eq: rollbackReference.value } },
			}),
		).resolves.toBe(true)
		expect(committedRoleEvents).toContain('ultimabase.roles.deleted')
	})

	it('applies each role deletion policy and rolls back the complete collection', async () => {
		const options: OperationOptions = masterOptions
		const first = await FailRole.createOne(
			{ data: { name: 'batch-first' } },
			options,
		)
		const second = await FailRole.createOne(
			{ data: { name: 'batch-second' } },
			options,
		)
		const member = requireMember(alice, 'Alice')
		await FailRole.updateOne(
			{
				where: { id: { eq: second.id } },
				data: { members: { connect: [member.id] } },
			},
			options,
		)
		const where = [first, second].map(({ id }) => ({ id: { eq: id } }))
		const eventCount = committedRoleEvents.length

		// A later item's policy failure must undo the earlier deletion and its event.
		await expect(FailRole.deleteMany({ where }, options)).rejects.toMatchObject(
			{
				code: 'ROLE_DELETE_REFERENCED',
			},
		)
		for (const target of where) {
			await expect(FailRole.exists({ where: target }, options)).resolves.toBe(
				true,
			)
		}
		expect(committedRoleEvents).toHaveLength(eventCount)

		await FailRole.updateOne(
			{
				where: { id: { eq: second.id } },
				data: { members: { disconnect: [member.id] } },
			},
			options,
		)
		const eventsBeforeDelete = committedRoleEvents.length
		const deleted = await FailRole.deleteMany({ where }, options)
		expect(deleted.map(({ id }) => id)).toStrictEqual([first.id, second.id])
		expect(committedRoleEvents.slice(eventsBeforeDelete)).toStrictEqual([
			'ultimabase.roles.deleted',
			'ultimabase.roles.deleted',
		])
	})

	it('keeps the neutral provider boundary fail-closed and community-extensible', async () => {
		const app = getApplication()
		const row = await MissingProviderPost.createOne({
			data: { title: 'Provider boundary' },
		})
		await app.dispose()
		const missing = createProviderBoundaryApplication(
			getFixture().connectionUri,
			'missing',
		)
		await missing.start()
		resetMissingProviderHookCalls()

		try {
			await expect(
				MissingProviderPost.updateOne({
					where: { id: { eq: row.id } },
					data: { title: 'Must fail before hooks' },
				}),
			).rejects.toMatchObject({ code: 'PLUGIN_CAPABILITY_MISSING' })
			expect(missingProviderHookCalls).toBe(0)
		} finally {
			await missing.dispose()
		}

		const community = createProviderBoundaryApplication(
			getFixture().connectionUri,
			'community',
		)
		await community.start()
		resetMissingProviderHookCalls()

		try {
			await expect(
				MissingProviderPost.updateOne({
					where: { id: { eq: row.id } },
					data: { title: 'Community provider allowed' },
				}),
			).resolves.toMatchObject({ title: 'Community provider allowed' })
			expect(missingProviderHookCalls).toBe(1)
		} finally {
			await community.dispose()
		}
	})

	it('isolates role capabilities without retaining unused transport metadata', async () => {
		const first = createRoleApplication(getFixture().connectionUri, 'ignore')
		await first.start()
		const firstResolver = first.plugin(roleResolverConsumerPluginName)
		await first.dispose()
		const second = createRoleApplication(getFixture().connectionUri, 'ignore')
		await second.start()

		try {
			expect(second.plugin(roleResolverConsumerPluginName)).not.toBe(
				firstResolver,
			)
			await expect(
				AppRole.count(undefined, masterOptions),
			).resolves.toBeGreaterThan(0)
			expect(JSON.stringify(AppRole.definition)).not.toContain(
				'transportVisibility',
			)
		} finally {
			await second.dispose()
		}
	})
})
