import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	PublicError,
	UltimaBase,
	isAuthenticated,
	type PointerValue,
	type PolicyPredicate,
} from '@ultimabase/core'

import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { RoleSchema, hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { provideTestPrincipalResolver } from '../fixtures/access-capability-fixtures.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	RequestContext,
	RequestContextValue,
	requestSources,
	plugin,
} from '@ultimabase/core/plugin'

// ADR-0304: Core resolves the principal once per request and hands it to
// Access rules, predicates, Hooks, ACL callbacks and Roles.
const signedIn = new RequestContextValue<PointerValue>(
	'fixture.principal.signed-in',
	(value) => {
		if (typeof value !== 'object' || value === null) {
			throw new TypeError('Fixture principal must be a Pointer')
		}
		return value as PointerValue
	},
)
let providerCalls = 0
const identityPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.principal-identity',
	version: '1.0.0',
	contributions: [
		provideTestPrincipalResolver({
			resolveCurrent: ({ context }) => {
				providerCalls += 1
				return context.getValue(signedIn)
			},
		}),
	],
})

const App = UltimaBase.use(
	accessPlugin({ default: true }),
	hooksPlugin(),
	aclPlugin(),
	rolesPlugin(),
)

const ruleInputs: unknown[] = []
const hookPrincipals: unknown[] = []

/** A named, side-effect-free predicate reading only the policy context. */
const isTodoAuthor: PolicyPredicate = function isTodoAuthor({
	operation,
	principal,
	schema,
}) {
	ruleInputs.push({ operation, principal: principal?.id, schema })
	return principal !== undefined
}

export const PrincipalMember = App.Schema.define({
	className: 'PrincipalMember',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({ access: { read: true, create: true } })

export const PrincipalRole = RoleSchema.define(App.Schema, {
	className: 'PrincipalRole',
	members: { schema: PrincipalMember },
	deletion: { references: 'fail' },
	fields: () => ({}),
})

let failPredicate: 'error' | 'public' | undefined
const explode: PolicyPredicate = function explode() {
	if (failPredicate === 'public') {
		throw new PublicError('Deletion is closed today.', {
			code: 'todo.deletion-closed',
		})
	}
	throw new Error('predicate exploded')
}

export const PrincipalTodo = App.Schema.define({
	className: 'PrincipalTodo',
	fields: (field) => ({
		title: field.string({ required: true }),
		owner: field.string(),
	}),
})
	.acl()
	.with({
		access: {
			create: isAuthenticated,
			read: true,
			update: hasRole(PrincipalRole.role('editor')),
			upsert: {
				allow: isTodoAuthor,
				item: ({ principal, item }) => item.owner === principal?.id,
			},
			delete: explode,
		},
		acl: { default: ({ principal }) => new ACL(principal) },
		hooks: {
			beforeOperation: {
				create: async ({ context }) => {
					hookPrincipals.push(context.principal?.id)
					// A hook-issued Master operation keeps the request principal.
					await PrincipalMember.count({}, { useMasterKey: true })
				},
			},
		},
	})

export const PrincipalAudit = App.Schema.define({
	className: 'PrincipalAudit',
	fields: (field) => ({ note: field.string() }),
}).with({
	access: { read: true, create: true },
	hooks: {
		beforeOperation: {
			create: ({ context }) => {
				hookPrincipals.push(`master:${String(context.principal?.id)}`)
			},
		},
	},
})

const masterKey = 'principal-policies-master-secret'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		identityPlugin,
		graphqlPlugin({ default: { mutations: true } }),
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'principal-policies', value: masterKey }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [PrincipalMember, PrincipalRole, PrincipalTodo, PrincipalAudit],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

type MemberPointer = ReturnType<typeof PrincipalMember.pointer>
let editor: MemberPointer
let reader: MemberPointer

const as = (principal: PointerValue | undefined): RequestContext => {
	const context = RequestContext.anonymous({
		requestId: `principal-${String(Math.random())}`,
		source: requestSources.internal,
	})
	return principal === undefined
		? context
		: context.withValue(signedIn, principal)
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'principal' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
	const options = { useMasterKey: true } as const
	const [editorRow, readerRow] = await PrincipalMember.createMany(
		{ data: [{ name: 'Editor' }, { name: 'Reader' }] },
		options,
	)
	if (editorRow === undefined || readerRow === undefined) {
		throw new TypeError('Members are missing')
	}
	editor = PrincipalMember.pointer(editorRow.id)
	reader = PrincipalMember.pointer(readerRow.id)
	const role = await PrincipalRole.createOne(
		{ data: { name: 'editor' } },
		options,
	)
	// ADR-0310: members link through the relation field (`connect`).
	await PrincipalRole.updateOne(
		{
			where: { id: { eq: role.id } },
			data: { members: { connect: [editor.id] } },
		},
		options,
	)
}, 60_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

beforeEach(() => {
	ruleInputs.length = 0
	hookPrincipals.length = 0
	providerCalls = 0
	failPredicate = undefined
})

describe('neutral current principal and policy predicates (ADR-0304)', () => {
	it('gives predicates and Hooks the principal, kept under Master, resolved once', async () => {
		await expect(
			PrincipalTodo.createOne(
				{ data: { title: 'Anonymous' } },
				{ context: as(undefined) },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

		providerCalls = 0
		const created = await PrincipalTodo.createOne(
			{ data: { title: 'Signed in', owner: editor.id } },
			{ context: as(editor) },
		)

		expect(created.title).toBe('Signed in')
		// The Hooks context and the Master operation of the hook see one principal.
		expect(hookPrincipals).toStrictEqual([editor.id])
		// One request: Access, ACL, Hooks and Roles share one resolution.
		expect(providerCalls).toBe(1)
	})

	it('reaches Master operations started from a request with its principal', async () => {
		const context = as(reader)
		await PrincipalAudit.createOne(
			{ data: { note: 'audited' } },
			{ context, useMasterKey: true },
		)
		expect(hookPrincipals).toStrictEqual([`master:${reader.id}`])
	})

	it('builds an owner ACL from the principal with new ACL(principal)', async () => {
		const created = await PrincipalTodo.createOne(
			{ data: { title: 'Owned' } },
			{ context: as(editor) },
		)

		await expect(
			PrincipalTodo.findOne(
				{ where: { id: { eq: created.id } } },
				{ context: as(editor) },
			),
		).resolves.toMatchObject({ id: created.id })
		await expect(
			PrincipalTodo.findOne(
				{ where: { id: { eq: created.id } } },
				{ context: as(reader) },
			),
		).resolves.toBeNull()
		expect(new ACL(undefined).toJSON()).toStrictEqual(new ACL().toJSON())
		expect(new ACL(editor).permissionsForPrincipal(editor)).toStrictEqual([
			'read',
			'update',
			'delete',
		])
	})

	it('lets Roles find the current member without resolveCurrent', async () => {
		const created = await PrincipalTodo.createOne(
			{ data: { title: 'Role check' } },
			{ context: as(editor) },
		)

		await expect(
			PrincipalTodo.updateOne(
				{ where: { id: { eq: created.id } }, data: { title: 'Edited' } },
				{ context: as(editor) },
			),
		).resolves.toMatchObject({ title: 'Edited' })
		// The reader holds no editor role.
		await expect(
			PrincipalTodo.updateOne(
				{ where: { id: { eq: created.id } }, data: { title: 'Denied' } },
				{ context: as(reader) },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(hasRole(PrincipalRole.role('editor')).name).toBe(
			'hasRole(PrincipalRole editor)',
		)
	})

	it('passes principal, operation and schema to predicates in Access rules', async () => {
		await PrincipalTodo.upsertOne(
			{
				where: { id: { eq: '0199c2d0-0000-7000-8000-0000000000aa' } },
				create: { title: 'Upserted', owner: editor.id },
				update: { title: 'Upserted again' },
			},
			{ context: as(editor) },
		)

		expect(ruleInputs).toContainEqual({
			operation: 'upsert',
			principal: editor.id,
			schema: 'PrincipalTodo',
		})
	})

	it('runs networkless GraphQL as an explicit principal', async () => {
		const graphql = ultimabase?.plugin('@ultimabase/graphql-plugin')
		if (graphql === undefined) throw new TypeError('GraphQL unavailable')
		const document = `mutation { createPrincipalTodo(input: { title: "GraphQL" }) { title } }`

		const anonymous = await graphql.execute({
			context: as(undefined),
			document,
		})
		const explicit = await graphql.execute({
			context: as(undefined),
			document,
			principal: editor,
		})
		// An explicit `undefined` principal runs anonymously even when signed in.
		const forcedAnonymous = await graphql.execute({
			context: as(editor),
			document,
			principal: undefined,
		})

		expect(anonymous.errors?.[0]?.extensions).toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		expect(explicit.errors).toBeUndefined()
		expect(explicit.data).toMatchObject({
			createPrincipalTodo: { title: 'GraphQL' },
		})
		expect(forcedAnonymous.errors?.[0]?.extensions).toMatchObject({
			code: 'PERMISSION_DENIED',
		})
	})

	it('fails closed when a predicate throws, and surfaces a PublicError', async () => {
		const created = await PrincipalTodo.createOne(
			{ data: { title: 'Kept' } },
			{ context: as(editor) },
		)
		failPredicate = 'error'
		await expect(
			PrincipalTodo.deleteOne(
				{ where: { id: { eq: created.id } } },
				{ context: as(editor) },
			),
		).rejects.toThrow('predicate exploded')
		failPredicate = 'public'
		await expect(
			PrincipalTodo.deleteOne(
				{ where: { id: { eq: created.id } } },
				{ context: as(editor) },
			),
		).rejects.toMatchObject({
			code: 'todo.deletion-closed',
			name: 'PublicError',
		})
		await expect(
			PrincipalTodo.count(
				{ where: { id: { eq: created.id } } },
				{ useMasterKey: true },
			),
		).resolves.toBe(1)
	})
})
