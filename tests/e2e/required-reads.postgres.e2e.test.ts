import { accessPlugin } from '@ultimabase/access-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// ADR-0307 decision 3: `findOneOrThrow` takes the input of `findOne`, is
// Access's `one` read, and reports a hidden row exactly like a missing one.
const App = UltimaBase.use(accessPlugin({ allowWithoutRule: { all: true } }))

const Doc = App.Schema.define({
	className: 'RequiredReadDoc',
	fields: (field) => ({
		title: field.string({ required: true }),
		visible: field.boolean({ default: true }),
	}),
}).with({
	// An Access rule object takes the same equality shorthand (ADR-0307).
	access: { read: () => ({ visible: true }) },
})

const OneOnly = App.Schema.define({
	className: 'RequiredReadOneOnly',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({
	access: {
		read: { count: false, exists: false, many: false, one: true },
	},
})

const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'required-reads', value: 'required-reads-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [Doc, OneOnly],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined
const master = { useMasterKey: true } as const
const notFound = {
	code: 'NOT_FOUND',
	publicMessage: 'The requested object was not found.',
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'required_reads' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('findOneOrThrow (ADR-0307)', { concurrent: false }, () => {
	it('returns the first visible row with the findOne projection', async () => {
		await Doc.createMany(
			{
				data: [{ title: 'b' }, { title: 'a' }, { title: 'c', visible: false }],
			},
			master,
		)

		await expect(
			Doc.findOneOrThrow({
				where: { visible: true },
				orderBy: { title: 'asc' },
				select: { title: true },
			}),
		).resolves.toMatchObject({ title: 'a' })
	})

	it('reports a hidden row exactly like a missing one', async () => {
		const hidden = await Doc.createOne(
			{ data: { title: 'hidden', visible: false } },
			master,
		)

		const hiddenFailure = await Doc.findOneOrThrow({
			where: { id: hidden.id },
		}).catch((error: unknown) => error)
		const missingFailure = await Doc.findOneOrThrow({
			where: { id: '0198f090-2a50-7000-8000-00000000ffff' },
		}).catch((error: unknown) => error)

		expect(hiddenFailure).toMatchObject(notFound)
		expect(missingFailure).toMatchObject(notFound)
		expect(String(hiddenFailure)).toBe(String(missingFailure))
		await expect(
			Doc.findOneOrThrow({ where: { id: hidden.id } }, master),
		).resolves.toMatchObject({ title: 'hidden' })
	})

	it('is the Access `one` read', async () => {
		const created = await OneOnly.createOne({ data: { title: 'one' } }, master)

		await expect(OneOnly.findMany()).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		await expect(
			OneOnly.findOneOrThrow({ where: { id: created.id } }),
		).resolves.toMatchObject({ title: 'one' })
		await expect(
			OneOnly.findOne({ where: { title: 'one' } }),
		).resolves.toMatchObject({ id: created.id })
	})
})
