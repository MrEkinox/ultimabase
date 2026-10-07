import {
	RequestContext,
	requestSources,
	runWithRequestEngine,
	type OperationOptions,
	type RequestRoleResolver,
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
	roleResolverConsumerPluginName,
	roleResolutionTrace,
} from './roles-postgres.fixture.js'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const requireRoleResolver = (value: unknown): RequestRoleResolver => {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('hasRole' in value) ||
		typeof value.hasRole !== 'function'
	) {
		throw new TypeError('Role resolver consumer did not expose hasRole')
	}

	return value as RequestRoleResolver
}

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
	await ExternalRoleReference.createOne({ data: { subject: reference.value } })
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = createRoleApplication(fixture.connectionUri)
	await ultimabase.start()

	;[alice, bob] = await RoleMember.createMany({
		data: [{ email: 'alice@example.test' }, { email: 'bob@example.test' }],
	})

	editor = await new AppRole({
		description: 'Can edit content',
		name: '  EDITOR  ',
		priority: 10,
	}).create({}, { useMasterKey: true })
	publisher = await new AppRole({ name: 'publisher', priority: 20 }).create(
		{},
		{ useMasterKey: true },
	)
	reviewer = await new AppRole({ name: 'reviewer', priority: 30 }).create(
		{},
		{ useMasterKey: true },
	)
	administrator = await new AppRole({
		description: 'Inherited administration',
		name: 'administrator',
		priority: 40,
	}).create({}, { useMasterKey: true })

	await requireRole(editor, 'editor').addMember(
		RoleMember.pointer(requireMember(alice, 'Alice').id),
		{ useMasterKey: true },
	)
	await requireRole(publisher, 'publisher').addRole(
		requireRole(editor, 'editor'),
		{ useMasterKey: true },
	)
	await requireRole(reviewer, 'reviewer').addRole(
		requireRole(editor, 'editor'),
		{ useMasterKey: true },
	)
	await requireRole(administrator, 'administrator').addRole(
		requireRole(publisher, 'publisher'),
		{ useMasterKey: true },
	)
	await requireRole(administrator, 'administrator').addRole(
		requireRole(reviewer, 'reviewer'),
		{ useMasterKey: true },
	)

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
		{ useMasterKey: true },
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
			{ useMasterKey: true },
		)

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
			{ data: { description: 'Edits published content' } },
			{ useMasterKey: true },
		)
		expect(updated.description).toBe('Edits published content')
		expect(roleDeveloperHookTrace).toContain('update-one')

		const eventCount = committedRoleEvents.length
		await currentEditor.addMember(currentBob, {
			useMasterKey: true,
		})
		await currentEditor.addMember(RoleMember.pointer(currentBob.id), {
			useMasterKey: true,
		})
		expect(await currentEditor.relation('members').count(undefined)).toBe(2)
		await currentEditor.removeMember(currentBob, {
			useMasterKey: true,
		})
		expect(await currentEditor.relation('members').count(undefined)).toBe(1)

		const temporaryChild = await new AppRole({
			name: 'temporary-child',
		}).create({}, { useMasterKey: true })
		await currentEditor.addRole(temporaryChild, {
			useMasterKey: true,
		})
		await expect(
			currentEditor.relation('roles').count(undefined),
		).resolves.toBe(1)
		await currentEditor.removeRole(temporaryChild, {
			useMasterKey: true,
		})
		await expect(
			currentEditor.relation('roles').count(undefined),
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
			{ useMasterKey: true },
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
			currentEditor.addRole(requireRole(administrator, 'administrator'), {
				useMasterKey: true,
			}),
		).rejects.toMatchObject({ code: 'ROLE_HIERARCHY_CYCLE' })
		await expect(
			currentEditor.relation('roles').count(undefined),
		).resolves.toBe(0)
		expect(committedRoleEvents).toHaveLength(eventCount)
	})

	it('keeps UUID references stable across role renames', async () => {
		const app = getApplication()
		const currentEditor = requireRole(editor, 'editor')
		const stableReference = AppRole.role({ id: currentEditor.id })
		const modelReference = currentEditor.toRequestRoleReference()
		expect(modelReference.value).toBe(stableReference.value)
		const renamed = await currentEditor.update(
			{ data: { name: 'content-editor' } },
			{ useMasterKey: true },
		)

		expect(renamed.name).toBe('content-editor')
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

	it('enforces fail, preserve, and cascade deletion policies atomically', async () => {
		const currentAlice = requireMember(alice, 'Alice')
		const failRole = await new FailRole({ name: 'fail-policy' }).create(
			{},
			{ useMasterKey: true },
		)
		await failRole.addMember(currentAlice, {
			useMasterKey: true,
		})
		await expect(
			failRole.delete({}, { useMasterKey: true }),
		).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })
		await failRole.removeMember(currentAlice, {
			useMasterKey: true,
		})
		const failReference = FailRole.role({ id: failRole.id })
		await createExternalReference(failReference)
		await expect(
			FailRole.deleteOne(
				{ where: { id: { eq: failRole.id } } },
				{ useMasterKey: true },
			),
		).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })
		const externalReferences = await ExternalRoleReference.findMany({
			where: { subject: { eq: failReference.value } },
			select: { id: true },
		})
		await ExternalRoleReference.deleteMany({
			where: externalReferences.map(({ id }) => ({ id: { eq: id } })),
		})
		await expect(
			failRole.delete({}, { useMasterKey: true }),
		).resolves.toMatchObject({ id: failRole.id })

		const preserveRole = await new PreserveRole({
			name: 'preserve-policy',
		}).create({}, { useMasterKey: true })
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

		const cascadeChild = await new CascadeRole({
			name: 'cascade-child',
		}).create({}, { useMasterKey: true })
		const cascadeParent = await new CascadeRole({
			name: 'cascade-parent',
		}).create({}, { useMasterKey: true })
		await cascadeChild.addMember(currentAlice, {
			useMasterKey: true,
		})
		await cascadeParent.addRole(cascadeChild, {
			useMasterKey: true,
		})
		const cascadeReference = CascadeRole.role({
			id: cascadeChild.id,
		})
		await createExternalReference(cascadeReference)
		await expect(cascadeChild.delete({})).rejects.toMatchObject({
			code: 'ROLE_DELETE_CASCADE_MASTER_REQUIRED',
		})
		await expect(
			cascadeChild.delete({}, { useMasterKey: true }),
		).resolves.toMatchObject({ id: cascadeChild.id })
		await expect(
			cascadeParent.relation('roles').count(undefined),
		).resolves.toBe(0)
		await expect(
			ExternalRoleReference.exists({
				where: { subject: { eq: cascadeReference.value } },
			}),
		).resolves.toBe(false)

		const rollbackRole = await new CascadeRole({
			name: 'cascade-rollback',
		}).create({}, { useMasterKey: true })
		const rollbackReference = CascadeRole.role({
			id: rollbackRole.id,
		})
		await createExternalReference(rollbackReference)
		rejectNextRoleReferenceCleanup()
		await expect(
			rollbackRole.delete({}, { useMasterKey: true }),
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
		const options: OperationOptions = { useMasterKey: true }
		const first = await FailRole.createOne(
			{ data: { name: 'batch-first' } },
			options,
		)
		const second = await FailRole.createOne(
			{ data: { name: 'batch-second' } },
			options,
		)
		const member = requireMember(alice, 'Alice')
		await second.addMember(member, options)
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

		await second.removeMember(member, options)
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
				AppRole.count(undefined, {
					useMasterKey: true,
				}),
			).resolves.toBeGreaterThan(0)
			expect(JSON.stringify(AppRole.definition)).not.toContain(
				'transportVisibility',
			)
		} finally {
			await second.dispose()
		}
	})
})
