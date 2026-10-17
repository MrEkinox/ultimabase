import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	UltimaBase,
	type FrameworkError,
	type Model,
} from '@ultimabase/core'
import {
	RequestContext,
	RequestContextValue,
	plugin,
	requestSources,
} from '@ultimabase/core/plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { provideTestPrincipalResolver } from '../../../../tests/fixtures/access-capability-fixtures.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// Clients never filter or order by `acl` (ADR-0321): a reader refused
// `select: { acl: true }` must not learn who else holds rights on a row by
// filtering on it. Master keeps filtering by the ACL.
const currentMemberId = new RequestContextValue<string>(
	'fixture.acl-filter.member-id',
	(value) => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('ACL filter member id must be a string')
		}
		return value
	},
)
const FilterApplication = UltimaBase.use(aclPlugin(), softDeletePlugin())
const FilterMember = FilterApplication.Schema.define({
	className: 'ACLFilterMember',
	fields: (field) => ({ name: field.string({ required: true }) }),
})
const identityPlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.acl-filter.identity',
	contributions: [
		provideTestPrincipalResolver({
			resolveCurrent: ({ context }) => {
				const id = context.getValue(currentMemberId)
				return id === undefined ? undefined : FilterMember.pointer(id)
			},
		}),
	],
})
/** Shared notes: whoever may update a note may share it and read its ACL. */
const FilterNote = FilterApplication.Schema.define({
	className: 'ACLFilterNote',
	fields: (field) => ({ title: field.string({ required: true }) }),
	acl: true,
	softDelete: { mode: 'command' },
}).with({
	acl: {
		default: ({ principal }) => new ACL(principal),
		clientSharing: ({ principal, currentAcl }) =>
			principal !== undefined &&
			currentAcl.hasPrincipalPermission(principal, 'update'),
	},
})
/** A schema without ACL that reaches notes through a pointer and a relation. */
const FilterFolder = FilterApplication.Schema.define({
	className: 'ACLFilterFolder',
	fields: (field) => ({
		label: field.string({ required: true }),
		notes: field.relation({ target: 'ACLFilterNote' }),
		pinned: field.pointer({ target: 'ACLFilterNote' }),
	}),
})

// Fixtures keep the identifiers that writes return.
type Member = Pick<Model<typeof FilterMember>, 'id'>
type Note = Pick<Model<typeof FilterNote>, 'id'>

let fixture: PostgresWorkerFixture | undefined
let ultimabase: Awaited<ReturnType<typeof createApplication>> | undefined
let ada: Member | undefined
let grace: Member | undefined
let linus: Member | undefined
let note: Note | undefined

const createApplication = (connectionUri: string) =>
	new (UltimaBase.use(
		identityPlugin,
		aclPlugin(),
		softDeletePlugin(),
		postgresPlugin({ schemaPolicy: 'override', url: connectionUri }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-filter-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: [FilterMember, FilterNote, FilterFolder],
	})

const required = <TValue>(value: TValue | undefined, label: string): TValue => {
	if (value === undefined) throw new TypeError(`Missing fixture: ${label}`)
	return value
}

const as = (member: Member | undefined, requestId: string) => ({
	context: RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	}).withValue(currentMemberId, required(member, 'member').id),
})
const anonymous = (requestId: string) => ({
	context: RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	}),
})
const master = { useMasterKey: true } as const

/** The ACL fragment naming Linus as a reader: what Grace must not probe. */
const linusReads = () =>
	({
		contains: {
			principals: [
				{
					className: FilterMember.className,
					id: required(linus, 'linus').id,
					permissions: ['read'],
				},
			],
		},
	}) as const

const noteId = () => required(note, 'note').id

/** The denial keeps its reason server-side and a generic public message. */
const expectFilterDenied = async (operation: Promise<unknown>) => {
	await expect(operation).rejects.toMatchObject({
		code: 'PERMISSION_DENIED',
		publicMessage: 'The operation is not permitted.',
	} satisfies Partial<FrameworkError>)
	await expect(operation).rejects.toThrow(
		'where: { acl } on ACLFilterNote requires useMasterKey: true',
	)
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = createApplication(fixture.connectionUri)
	await ultimabase.start()
	;[ada, grace, linus] = await FilterMember.createMany(
		{ data: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Linus' }] },
		master,
	)
	note = await FilterNote.createOne(
		{ data: { title: 'Plans' } },
		as(ada, 'ada-creates'),
	)
	// Ada shares the note read-only with Grace and with Linus.
	for (const reader of [grace, linus]) {
		await FilterNote.updateOne(
			{
				where: { id: note.id },
				data: {
					acl: {
						grant: {
							principal: FilterMember.pointer(required(reader, 'reader').id),
							permissions: ['read'],
						},
					},
				},
			},
			as(ada, 'ada-shares'),
		)
	}
	await FilterFolder.createOne(
		{
			data: {
				label: 'Shared',
				notes: { connect: [note.id] },
				pinned: { connect: FilterNote.pointer(note.id) },
			},
		},
		master,
	)
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('ACL filters with PostgreSQL', { concurrent: false }, () => {
	it('refuses a reader who filters by acl to learn other holders', async () => {
		const asGrace = as(grace, 'grace-probes')
		// Grace reads the note but may not read its ACL.
		await expect(
			FilterNote.findMany({ select: { title: true } }, asGrace),
		).resolves.toMatchObject([{ id: noteId(), title: 'Plans' }])
		await expect(
			FilterNote.findMany({ select: { acl: true } }, asGrace),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expectFilterDenied(
			FilterNote.findMany({ where: { acl: linusReads() } }, asGrace),
		)
		// Anonymous callers cannot probe public rights either.
		await expectFilterDenied(
			FilterNote.findMany(
				{ where: { acl: { contains: { public: ['read'] } } } },
				anonymous('anonymous-probes'),
			),
		)
	})

	it('refuses acl filters inside AND, OR and NOT', async () => {
		const asGrace = as(grace, 'grace-combines')
		const titled = { title: { eq: 'Plans' } } as const

		for (const where of [
			{ AND: [titled, { acl: linusReads() }] },
			{ OR: [titled, { acl: linusReads() }] },
			{ NOT: { acl: linusReads() } },
			{ OR: [titled, { AND: [titled, { NOT: { acl: linusReads() } }] }] },
		]) {
			await expectFilterDenied(FilterNote.findMany({ where }, asGrace))
		}
	})

	it('refuses acl filters on every query-backed operation', async () => {
		const asGrace = as(grace, 'grace-operations')
		const where = { id: { eq: noteId() }, acl: linusReads() }
		const operations: readonly (() => Promise<unknown>)[] = [
			() => FilterNote.findOne({ where }, asGrace),
			() => FilterNote.findOneOrThrow({ where }, asGrace),
			() => FilterNote.count({ where }, asGrace),
			() => FilterNote.exists({ where }, asGrace),
			// Plugin commands carrying a query are filtered like native reads.
			() => FilterNote.softDeleteMany({ where }, asGrace),
			() => FilterNote.restoreMany({ where }, asGrace),
		]

		for (const operation of operations) {
			await expectFilterDenied(operation())
		}
		// Native mutations target rows by unique equality only: no acl filter.
		for (const operation of [
			() => FilterNote.updateOne({ where, data: { title: 'Mine' } }, asGrace),
			() => FilterNote.deleteOne({ where }, asGrace),
			() =>
				FilterNote.updateMany(
					{ data: [{ where, data: { title: 'Mine' } }] },
					asGrace,
				),
			() => FilterNote.deleteMany({ where: [where] }, asGrace),
		]) {
			await expect(async () => operation()).rejects.toThrow(
				'where must contain distinct non-null equality filters',
			)
		}
		await expect(
			FilterNote.findOneOrThrow({ where: { id: noteId() } }, master),
		).resolves.toMatchObject({ isDeleted: false, title: 'Plans' })
	})

	it('refuses acl filters even where clientSharing reads the acl', async () => {
		const asAda = as(ada, 'ada-filters')
		// Ada may share the note, so she may select its ACL...
		await expect(
			FilterNote.findOneOrThrow(
				{ where: { id: noteId() }, select: { acl: true } },
				asAda,
			),
		).resolves.toMatchObject({ id: noteId() })
		// ...but clientSharing opens select and grant/revoke, never filters.
		await expectFilterDenied(
			FilterNote.findMany({ where: { acl: linusReads() } }, asAda),
		)
	})

	it('refuses acl filters reached through a relation from another schema', async () => {
		const asGrace = as(grace, 'grace-relations')
		await expect(
			FilterFolder.findMany({ where: { label: { eq: 'Shared' } } }, asGrace),
		).resolves.toHaveLength(1)

		for (const where of [
			{ notes: { some: { acl: linusReads() } } },
			{ notes: { none: { acl: linusReads() } } },
			{ notes: { every: { acl: linusReads() } } },
			{ notes: { count: { gte: 1, where: { acl: linusReads() } } } },
			{ pinned: { is: { acl: linusReads() } } },
			{ pinned: { isNot: { acl: linusReads() } } },
			{
				OR: [
					{ label: { eq: 'Shared' } },
					{ pinned: { is: { NOT: { acl: linusReads() } } } },
				],
			},
		]) {
			await expectFilterDenied(FilterFolder.findMany({ where }, asGrace))
		}
	})

	it('hides an included target filtered by acl whether or not it matches', async () => {
		const asGrace = as(grace, 'grace-includes')
		const includeNotes = (where: { readonly acl?: unknown }) =>
			FilterFolder.findOneOrThrow(
				{ where: { label: { eq: 'Shared' } }, include: { notes: { where } } },
				asGrace,
			)
		const holding = (member: Member | undefined) => ({
			acl: {
				contains: {
					principals: [
						{
							className: FilterMember.className,
							id: required(member, 'member').id,
						},
					],
				},
			},
		})

		// Grace sees the included note when she does not filter by its ACL.
		await expect(includeNotes({})).resolves.toMatchObject({
			notes: [{ id: noteId() }],
		})
		// A denied inclusion reads as absent, so matching and not matching
		// filters look the same.
		await expect(includeNotes(holding(linus))).resolves.toMatchObject({
			notes: [],
		})
		await expect(includeNotes(holding(grace))).resolves.toMatchObject({
			notes: [],
		})
	})

	it('refuses ordering by acl for every caller', async () => {
		// Core orders only by scalar and enum fields, so no caller can order by
		// the ACL; the field policy has no ordering to refuse.
		for (const options of [as(grace, 'grace-orders'), master]) {
			await expect(async () =>
				FilterNote.findMany(
					// @ts-expect-error -- `orderBy` keys exclude plugin field kinds (ADR-0332).
					{ orderBy: { acl: 'asc' } },
					options,
				),
			).rejects.toThrow('must name a non-list scalar or enum field')
		}
	})

	it('keeps Master filtering by acl', async () => {
		await expect(
			FilterNote.findMany({ where: { acl: linusReads() } }, master),
		).resolves.toMatchObject([{ id: noteId() }])
		await expect(
			FilterNote.count(
				{ where: { acl: { contains: { public: ['read'] } } } },
				master,
			),
		).resolves.toBe(0)
		await expect(
			FilterFolder.findMany(
				{ where: { notes: { some: { acl: linusReads() } } } },
				master,
			),
		).resolves.toMatchObject([{ label: 'Shared' }])
	})
})
