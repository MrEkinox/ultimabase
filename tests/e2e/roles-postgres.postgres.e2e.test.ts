import {
	Query,
	RequestContext,
	accessRoleResolverServiceToken,
	requestSources,
	runWithRequestEngine,
} from '@ultimabase/core'
import {
	resolveRoleReference,
	type RoleReference,
} from '@ultimabase/roles-plugin'
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
	currentRoleMemberId,
	masterRoleAccessReasons,
	missingProviderHookCalls,
	rejectNextRoleReferenceCleanup,
	resetMissingProviderHookCalls,
	roleDeveloperHookTrace,
	roleQueryTrace,
} from './roles-postgres.fixture.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

type RoleApplication = ReturnType<typeof createRoleApplication>
type PersistedAppRole = Awaited<
	ReturnType<InstanceType<typeof AppRole>['create']>
>
type PersistedMember = Awaited<
	ReturnType<InstanceType<typeof RoleMember>['create']>
>

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

const requireMember = (
	member: PersistedMember | undefined,
	label: string,
): PersistedMember => {
	if (member === undefined) {
		throw new TypeError(`Missing persisted ${label} member fixture`)
	}

	return member
}

const requireRole = (
	role: PersistedAppRole | undefined,
	label: string,
): PersistedAppRole => {
	if (role === undefined) {
		throw new TypeError(`Missing persisted ${label} role fixture`)
	}

	return role
}

/** Creates plugin-owned identity state without introducing a Core user mode. */
const createMemberContext = (memberId: string, requestId: string) =>
	RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	}).withValue(currentRoleMemberId, memberId)

/** Persists one neutral external role reference through the ordinary Query API. */
const createExternalReference = async (
	reference: RoleReference,
): Promise<void> => {
	await ExternalRoleReference.create(
		{ subject: reference.value },
		{ ultimabase: getApplication() },
	)
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = createRoleApplication(fixture.connectionUri)
	await ultimabase.start()

	const app = getApplication()
	;[alice, bob] = await RoleMember.createMany(
		[{ email: 'alice@example.test' }, { email: 'bob@example.test' }],
		{ ultimabase: app },
	)

	editor = await new AppRole({
		description: 'Can edit content',
		name: '  EDITOR  ',
		priority: 10,
	}).create({ ultimabase: app, useMasterKey: true })
	publisher = await new AppRole({ name: 'publisher', priority: 20 }).create({
		ultimabase: app,
		useMasterKey: true,
	})
	reviewer = await new AppRole({ name: 'reviewer', priority: 30 }).create({
		ultimabase: app,
		useMasterKey: true,
	})
	administrator = await new AppRole({
		description: 'Inherited administration',
		name: 'administrator',
		priority: 40,
	}).create({ ultimabase: app, useMasterKey: true })

	await requireRole(editor, 'editor').addMember(
		RoleMember.pointer(requireMember(alice, 'Alice').id),
		{ ultimabase: app, useMasterKey: true },
	)
	await requireRole(publisher, 'publisher').addRole(
		requireRole(editor, 'editor'),
		{ ultimabase: app, useMasterKey: true },
	)
	await requireRole(reviewer, 'reviewer').addRole(
		requireRole(editor, 'editor'),
		{ ultimabase: app, useMasterKey: true },
	)
	await requireRole(administrator, 'administrator').addRole(
		requireRole(publisher, 'publisher'),
		{ ultimabase: app, useMasterKey: true },
	)
	await requireRole(administrator, 'administrator').addRole(
		requireRole(reviewer, 'reviewer'),
		{ ultimabase: app, useMasterKey: true },
	)

	const posts = await ProtectedPost.createMany(
		[
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
		{ ultimabase: app, useMasterKey: true },
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
		const app = getApplication()
		const currentEditor = requireRole(editor, 'editor')
		const currentBob = requireMember(bob, 'Bob')

		expect(currentEditor.name).toBe('editor')
		expect(currentEditor.description).toBe('Can edit content')
		expect(currentEditor.priority).toBe(10)

		const selected = await new Query(AppRole)
			.greaterThanOrEqualTo('priority', 10)
			.ascending('priority')
			.select('id', 'name', 'priority')
			.find({ ultimabase: app, useMasterKey: true })

		expect(selected.map((role) => role.toJSON())).toStrictEqual([
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
		const updated = await currentEditor.update(
			{ description: 'Edits published content' },
			{ ultimabase: app, useMasterKey: true },
		)
		expect(updated?.description).toBe('Edits published content')
		expect(roleDeveloperHookTrace).toContain('update-one')

		const eventCount = committedRoleEvents.length
		await currentEditor.addMember(currentBob, {
			ultimabase: app,
			useMasterKey: true,
		})
		await currentEditor.addMember(RoleMember.pointer(currentBob.id), {
			ultimabase: app,
			useMasterKey: true,
		})
		expect(
			await currentEditor
				.relation('members')
				.query()
				.count({ ultimabase: app }),
		).toBe(2)
		await currentEditor.removeMember(currentBob, {
			ultimabase: app,
			useMasterKey: true,
		})
		expect(
			await currentEditor
				.relation('members')
				.query()
				.count({ ultimabase: app }),
		).toBe(1)

		const temporaryChild = await new AppRole({
			name: 'temporary-child',
		}).create({ ultimabase: app, useMasterKey: true })
		await currentEditor.addRole(temporaryChild, {
			ultimabase: app,
			useMasterKey: true,
		})
		await expect(
			currentEditor.relation('roles').query().count({ ultimabase: app }),
		).resolves.toBe(1)
		await currentEditor.removeRole(temporaryChild, {
			ultimabase: app,
			useMasterKey: true,
		})
		await expect(
			currentEditor.relation('roles').query().count({ ultimabase: app }),
		).resolves.toBe(0)
		expect(committedRoleEvents.slice(eventCount)).toContain(
			'ultimabase.roles.membership.changed',
		)
		expect(committedRoleEvents.slice(eventCount)).toContain(
			'ultimabase.roles.hierarchy.changed',
		)
		expect(masterRoleAccessReasons.length).toBeGreaterThan(0)
	})

	it('resolves direct and diamond-inherited roles once per request', async () => {
		const app = getApplication()
		const aliceContext = createMemberContext(
			requireMember(alice, 'Alice').id,
			'roles-e2e-alice-update',
		)
		const bobContext = createMemberContext(
			requireMember(bob, 'Bob').id,
			'roles-e2e-bob-update',
		)

		roleQueryTrace.length = 0
		const updated = await ProtectedPost.updateOne(
			{
				where: (where) => where.byId(publishedPostId),
				data: { title: 'Updated through inherited roles' },
			},
			{ context: aliceContext, ultimabase: app },
		)

		expect(updated?.internalNote).toBe('visible to administrators')
		// One membership graph and two named references serve operation and field Access.
		expect(roleQueryTrace).toHaveLength(7)
		await expect(
			ProtectedPost.updateOne(
				{
					where: (where) => where.byId(publishedPostId),
					data: { title: 'Bob must not update' },
				},
				{ context: bobContext, ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

		const visible = await ProtectedPost.query()
			.select('id', 'internalNote', 'title')
			.find({ context: aliceContext, ultimabase: app })
		expect(visible).toHaveLength(1)
		expect(visible[0]?.id).toBe(publishedPostId)
		await expect(
			ProtectedPost.query().byId(privatePostId).exists({
				context: aliceContext,
				ultimabase: app,
			}),
		).resolves.toBe(false)

		const deletable = await ProtectedPost.create(
			{ published: true, title: 'Role-protected deletion' },
			{ ultimabase: app, useMasterKey: true },
		)
		await expect(
			ProtectedPost.deleteOne(
				{ where: (where) => where.byId(deletable.id) },
				{ context: aliceContext, ultimabase: app },
			),
		).resolves.toMatchObject({ id: deletable.id })

		roleQueryTrace.length = 0
		await ProtectedPost.updateOne(
			{
				where: (where) => where.byId(publishedPostId),
				data: {
					title: 'A second terminal gets a fresh role snapshot',
				},
			},
			{ context: aliceContext, ultimabase: app },
		)
		expect(roleQueryTrace).toHaveLength(7)
	})

	it('rolls back indirect hierarchy cycles without publishing an event', async () => {
		const app = getApplication()
		const currentEditor = requireRole(editor, 'editor')
		const eventCount = committedRoleEvents.length

		await expect(
			currentEditor.addRole(requireRole(administrator, 'administrator'), {
				ultimabase: app,
				useMasterKey: true,
			}),
		).rejects.toMatchObject({ code: 'ROLE_HIERARCHY_CYCLE' })
		await expect(
			currentEditor.relation('roles').query().count({ ultimabase: app }),
		).resolves.toBe(0)
		expect(committedRoleEvents).toHaveLength(eventCount)
	})

	it('keeps UUID references stable across role renames', async () => {
		const app = getApplication()
		const currentEditor = requireRole(editor, 'editor')
		const stableReference = AppRole.role({ id: currentEditor.id })
		const renamed = await currentEditor.update(
			{ name: 'content-editor' },
			{ ultimabase: app, useMasterKey: true },
		)

		expect(renamed?.name).toBe('content-editor')
		await expect(
			resolveRoleReference(stableReference, { ultimabase: app }),
		).resolves.toMatchObject({ id: currentEditor.id, name: 'content-editor' })
		await expect(
			resolveRoleReference(EditorReference, { ultimabase: app }),
		).rejects.toMatchObject({ code: 'ROLE_REFERENCE_UNKNOWN' })

		const context = createMemberContext(
			requireMember(alice, 'Alice').id,
			'roles-e2e-stable-reference',
		)
		const request = app.engine.withContext(context)
		const resolver = app.application.getService(accessRoleResolverServiceToken)

		await expect(
			runWithRequestEngine(request, () =>
				resolver.hasRole({ context, role: stableReference }),
			),
		).resolves.toBe(true)
	})

	it('enforces fail, preserve, and cascade deletion policies atomically', async () => {
		const app = getApplication()
		const currentAlice = requireMember(alice, 'Alice')
		const failRole = await new FailRole({ name: 'fail-policy' }).create({
			ultimabase: app,
			useMasterKey: true,
		})
		await failRole.addMember(currentAlice, {
			ultimabase: app,
			useMasterKey: true,
		})
		await expect(
			failRole.delete({ ultimabase: app, useMasterKey: true }),
		).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })
		await failRole.removeMember(currentAlice, {
			ultimabase: app,
			useMasterKey: true,
		})
		const failReference = FailRole.role({ id: failRole.id })
		await createExternalReference(failReference)
		await expect(
			FailRole.deleteOne(
				{ where: (where) => where.byId(failRole.id) },
				{ ultimabase: app, useMasterKey: true },
			),
		).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })
		await ExternalRoleReference.deleteMany(
			{ where: (where) => where.equalTo('subject', failReference.value) },
			{ ultimabase: app },
		)
		await expect(
			failRole.delete({ ultimabase: app, useMasterKey: true }),
		).resolves.toMatchObject({ id: failRole.id })

		const preserveRole = await new PreserveRole({
			name: 'preserve-policy',
		}).create({
			ultimabase: app,
			useMasterKey: true,
		})
		const preserveReference = PreserveRole.role({ id: preserveRole.id })
		await createExternalReference(preserveReference)
		await expect(
			PreserveRole.deleteOne(
				{ where: (where) => where.byId(preserveRole.id) },
				{ ultimabase: app },
			),
		).resolves.toMatchObject({ id: preserveRole.id })
		await expect(
			ExternalRoleReference.query()
				.equalTo('subject', preserveReference.value)
				.exists({ ultimabase: app }),
		).resolves.toBe(true)

		const cascadeChild = await new CascadeRole({
			name: 'cascade-child',
		}).create({
			ultimabase: app,
			useMasterKey: true,
		})
		const cascadeParent = await new CascadeRole({
			name: 'cascade-parent',
		}).create({
			ultimabase: app,
			useMasterKey: true,
		})
		await cascadeChild.addMember(currentAlice, {
			ultimabase: app,
			useMasterKey: true,
		})
		await cascadeParent.addRole(cascadeChild, {
			ultimabase: app,
			useMasterKey: true,
		})
		const cascadeReference = CascadeRole.role({ id: cascadeChild.id })
		await createExternalReference(cascadeReference)
		await expect(
			cascadeChild.delete({ ultimabase: app }),
		).rejects.toMatchObject({ code: 'ROLE_DELETE_CASCADE_MASTER_REQUIRED' })
		await expect(
			cascadeChild.delete({ ultimabase: app, useMasterKey: true }),
		).resolves.toMatchObject({ id: cascadeChild.id })
		await expect(
			cascadeParent.relation('roles').query().count({ ultimabase: app }),
		).resolves.toBe(0)
		await expect(
			ExternalRoleReference.query()
				.equalTo('subject', cascadeReference.value)
				.exists({ ultimabase: app }),
		).resolves.toBe(false)

		const rollbackRole = await new CascadeRole({
			name: 'cascade-rollback',
		}).create({
			ultimabase: app,
			useMasterKey: true,
		})
		const rollbackReference = CascadeRole.role({ id: rollbackRole.id })
		await createExternalReference(rollbackReference)
		rejectNextRoleReferenceCleanup()
		await expect(
			rollbackRole.delete({ ultimabase: app, useMasterKey: true }),
		).rejects.toThrow('external role cleanup rollback fixture')
		await expect(
			CascadeRole.query().byId(rollbackRole.id).exists({ ultimabase: app }),
		).resolves.toBe(true)
		await expect(
			ExternalRoleReference.query()
				.equalTo('subject', rollbackReference.value)
				.exists({ ultimabase: app }),
		).resolves.toBe(true)
		await expect(
			CascadeRole.deleteMany(
				{ where: 'all' },
				{ ultimabase: app, useMasterKey: true },
			),
		).rejects.toMatchObject({ code: 'ROLE_DELETE_BULK_UNSUPPORTED' })
		expect(committedRoleEvents).toContain('ultimabase.roles.deleted')
	})

	it('keeps the neutral provider boundary fail-closed and community-extensible', async () => {
		const app = getApplication()
		const row = await MissingProviderPost.create(
			{ title: 'Provider boundary' },
			{ ultimabase: app },
		)
		const missing = createProviderBoundaryApplication(
			getFixture().connectionUri,
			'missing',
		)
		await missing.start()
		resetMissingProviderHookCalls()

		try {
			await expect(
				MissingProviderPost.updateOne(
					{
						where: (where) => where.byId(row.id),
						data: { title: 'Must fail before hooks' },
					},
					{ ultimabase: missing },
				),
			).rejects.toMatchObject({ code: 'SERVICE_NOT_FOUND' })
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
				MissingProviderPost.updateOne(
					{
						where: (where) => where.byId(row.id),
						data: { title: 'Community provider allowed' },
					},
					{ ultimabase: community },
				),
			).resolves.toMatchObject({ title: 'Community provider allowed' })
			expect(missingProviderHookCalls).toBe(1)
		} finally {
			await community.dispose()
		}
	})

	it('isolates role services between applications and hides transport metadata', async () => {
		const first = getApplication()
		const second = createRoleApplication(getFixture().connectionUri, 'ignore')
		await second.start()

		try {
			expect(
				second.application.getService(accessRoleResolverServiceToken),
			).not.toBe(first.application.getService(accessRoleResolverServiceToken))
			await expect(
				AppRole.query().count({ ultimabase: second, useMasterKey: true }),
			).resolves.toBeGreaterThan(0)
			const [transportExtension] = AppRole.extensions

			expect(transportExtension.name).toBe('ultimabase.roles.schema')
			expect(transportExtension.config.transportVisibility).toBe('hidden')
		} finally {
			await second.dispose()
		}
	})
})
