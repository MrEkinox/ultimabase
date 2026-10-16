import { accessPlugin } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	UltimaBase,
	runWithRequestEngine,
	type PointerValue,
} from '@ultimabase/core'
import {
	RequestContext,
	RequestContextValue,
	plugin,
	requestSources,
	withContext,
} from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { provideTestPrincipalResolver } from '../../../../tests/fixtures/access-capability-fixtures.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0322: role queries outside rules and seed roles created at start().
const signedIn = new RequestContextValue<PointerValue>(
	'fixture.roles-queries.signed-in',
	(value) => {
		if (typeof value !== 'object' || value === null) {
			throw new TypeError('Fixture principal must be a Pointer')
		}
		return value as PointerValue
	},
)
const identity = plugin({
	core: '^0.0.0',
	id: 'fixture.roles-queries.identity',
	version: '1.0.0',
	contributions: [
		provideTestPrincipalResolver({
			resolveCurrent: ({ context }) => context.getValue(signedIn),
		}),
	],
})

const App = UltimaBase.use(
	accessPlugin({ allowWithoutRule: { all: true } }),
	hooksPlugin(),
	rolesPlugin(),
)

/** Inserts a role from another connection, as another instance would. */
let competingInsert: ((name: string) => Promise<void>) | undefined

const QueryMember = App.Schema.define({
	className: 'RoleQueryMember',
	fields: (field) => ({ email: field.string({ required: true }) }),
})
const QueryRole = App.RoleSchema.define({
	className: 'RoleQueryRole',
	members: () => QueryMember,
	fields: (field) => ({ description: field.string() }),
}).with({
	roles: { ensure: ['Admin', 'editor'] },
	hooks: {
		beforeOperation: {
			create: async ({ item }) => {
				await competingInsert?.(item.name)
			},
		},
	},
})
const QueryTeam = App.RoleSchema.define({
	className: 'RoleQueryTeam',
	members: () => QueryMember,
}).with({ roles: { ensure: ['lead'] } })

const createApplication = (connectionUri: string) =>
	new (App.use(identity, postgresPlugin({ url: connectionUri })))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'roles-queries-master', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: [QueryMember, QueryRole, QueryTeam],
	})

type QueryApplication = ReturnType<typeof createApplication>

let fixture: PostgresWorkerFixture | undefined
let application: QueryApplication | undefined

const requireFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) throw new TypeError('Fixture has not started')
	return fixture
}

const master = { useMasterKey: true } as const

const listRoleNames = async (): Promise<readonly string[]> =>
	(
		await QueryRole.findMany(
			{ select: { name: true }, orderBy: { name: 'asc' } },
			master,
		)
	).map(({ name }) => name)

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
})

afterEach(async () => {
	competingInsert = undefined
	await application?.dispose()
	application = undefined
})

describe('Roles queries and seed roles', { concurrent: false }, () => {
	it('creates ensure roles at start() and leaves existing ones unchanged', async () => {
		application = createApplication(requireFixture().connectionUri)
		await application.start()

		await expect(listRoleNames()).resolves.toStrictEqual(['admin', 'editor'])
		expect(
			(await QueryTeam.findMany({ select: { name: true } }, master)).map(
				({ name }) => name,
			),
		).toStrictEqual(['lead'])
		await QueryRole.updateOne(
			{ where: { name: { eq: 'admin' } }, data: { description: 'kept' } },
			master,
		)
		await application.dispose()

		// A second start is idempotent: nothing is created or changed.
		application = createApplication(requireFixture().connectionUri)
		await application.start()
		await expect(listRoleNames()).resolves.toStrictEqual(['admin', 'editor'])
		await expect(
			QueryRole.findOne(
				{ where: { name: { eq: 'admin' } }, select: { description: true } },
				master,
			),
		).resolves.toMatchObject({ description: 'kept' })
	})

	it('treats a role created concurrently by another instance as present', async () => {
		const { pool, schemaName } = requireFixture()
		application = createApplication(requireFixture().connectionUri)
		await application.start()
		await application.dispose()
		await pool.query(
			`DELETE FROM "${schemaName}"."role_query_roles" WHERE name = 'editor'`,
		)
		competingInsert = async (name) => {
			competingInsert = undefined
			// Another connection commits the same name first.
			await pool.query(
				`INSERT INTO "${schemaName}"."role_query_roles" (id, name, created_at, updated_at) VALUES (gen_random_uuid(), $1, now(), now())`,
				[name],
			)
		}
		application = createApplication(requireFixture().connectionUri)
		await application.start()

		await expect(listRoleNames()).resolves.toStrictEqual(['admin', 'editor'])
	})

	it('answers has() and current() with inheritance, for a request or a principal', async () => {
		application = createApplication(requireFixture().connectionUri)
		const app = await application.start()
		const roles = app.plugin(rolesPlugin)
		const [alice, bob] = await QueryMember.createMany(
			{ data: [{ email: 'alice@x.test' }, { email: 'bob@x.test' }] },
			master,
		)
		if (alice === undefined || bob === undefined) {
			throw new TypeError('Fixture members are missing')
		}
		const admin = await QueryRole.findOneOrThrow(
			{ where: { name: { eq: 'admin' } } },
			master,
		)
		const editor = await QueryRole.findOneOrThrow(
			{ where: { name: { eq: 'editor' } } },
			master,
		)
		// Editor's members are members of Admin too.
		await QueryRole.updateOne(
			{
				where: { id: admin.id },
				data: { includedRoles: { connect: [editor.id] } },
			},
			master,
		)
		await QueryRole.updateOne(
			{
				where: { id: editor.id },
				data: { members: { connect: [QueryMember.pointer(alice.id)] } },
			},
			master,
		)
		const asAlice = RequestContext.anonymous({
			requestId: 'roles-queries-alice',
			source: requestSources.internal,
		}).withValue(signedIn, QueryMember.pointer(alice.id))
		const inRequest = <TResult>(work: () => Promise<TResult>) =>
			runWithRequestEngine(withContext(app, asAlice), work)

		await expect(
			inRequest(() => roles.has(QueryRole.role('admin'))),
		).resolves.toBe(true)
		await expect(
			inRequest(() => roles.has(QueryTeam.role('lead'))),
		).resolves.toBe(false)
		await expect(
			inRequest(() => roles.current(QueryRole)),
		).resolves.toStrictEqual(['admin', 'editor'])
		await expect(
			inRequest(() => roles.current(QueryTeam)),
		).resolves.toStrictEqual([])
		await expect(
			roles.has(QueryRole.role('admin'), {
				principal: QueryMember.pointer(bob.id),
			}),
		).resolves.toBe(false)
		await expect(
			roles.has(QueryRole.role({ id: admin.id }), {
				principal: QueryMember.pointer(alice.id),
			}),
		).resolves.toBe(true)
		await expect(
			roles.has(QueryRole.role('missing'), {
				principal: QueryMember.pointer(alice.id),
			}),
		).resolves.toBe(false)
		await expect(roles.has(QueryRole.role('admin'))).rejects.toMatchObject({
			code: 'MISSING_EXECUTION_CONTEXT',
		})
	})

	it('rejects includedRoles cycles and excessive depth through connect', async () => {
		application = createApplication(requireFixture().connectionUri)
		await application.start()
		const [cycleA, cycleB] = await QueryTeam.createMany(
			{ data: [{ name: 'cycle-a' }, { name: 'cycle-b' }] },
			master,
		)
		if (cycleA === undefined || cycleB === undefined) {
			throw new TypeError('Fixture roles are missing')
		}
		await QueryTeam.updateOne(
			{
				where: { id: cycleA.id },
				data: { includedRoles: { connect: [cycleB.id] } },
			},
			master,
		)
		await expect(
			QueryTeam.updateOne(
				{
					where: { id: cycleB.id },
					data: { includedRoles: { connect: [cycleA.id] } },
				},
				master,
			),
		).rejects.toMatchObject({ code: 'ROLE_HIERARCHY_CYCLE' })

		// 66 roles: linking the bottom first keeps each check within 64 levels;
		// the last link puts 65 levels under the top role.
		const chain = await QueryTeam.createMany(
			{
				data: Array.from({ length: 66 }, (_, index) => ({
					name: `level-${String(index)}`,
				})),
			},
			master,
		)
		const link = (parent: number) => {
			const role = chain[parent]
			const child = chain[parent + 1]
			if (role === undefined || child === undefined) {
				throw new TypeError('Fixture roles are missing')
			}
			return QueryTeam.updateOne(
				{
					where: { id: role.id },
					data: { includedRoles: { connect: [child.id] } },
				},
				master,
			)
		}
		for (let parent = 64; parent >= 1; parent -= 1) await link(parent)
		await expect(link(0)).rejects.toMatchObject({
			code: 'ROLE_HIERARCHY_LIMIT',
		})
	})
})
