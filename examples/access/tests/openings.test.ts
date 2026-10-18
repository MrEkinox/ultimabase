import type { AccessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import {
	developmentAccess,
	Draft,
	memberWritesAccess,
	readOnlyAccess,
} from '../src/openings.ts'
import { Member } from '../src/schema.ts'

// Each opening configures Access for its own small application holding
// `Draft` and `Member`, two schemas without any rule.
const applicationWith = (access: AccessPlugin) =>
	new (UltimaBase.use(access, postgresPlugin()))({ schemas: [Member, Draft] })

const denied = { code: 'PERMISSION_DENIED' }
const draft = { data: { title: 'Notes' } }

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

// Runs first: testApplication keeps its application active until the file
// ends. Access refuses whatever the schemas; without schemas, the
// application starts without a database (ADR-0340), so none is needed.
it("refuses to start in production with 'development'", async () => {
	vi.stubEnv('NODE_ENV', 'production')
	const ultimabase = new (UltimaBase.use(developmentAccess()))({
		logger: false,
		schemas: [],
	})
	try {
		await expect(ultimabase.start()).rejects.toThrow(
			"Access allowWithoutRule opens every operation and request plugin command with 'development', which production refuses (NODE_ENV is production). Write schema rules, or use true to open them in production too.",
		)
	} finally {
		await ultimabase.dispose()
	}
})

it('opens reads and keeps writes denied', async () => {
	const warn = vi.spyOn(console, 'warn')
	await using t = await testApplication(applicationWith(readOnlyAccess()))

	// After start(), one warn line per opening (`false` opens nothing).
	expect(warn.mock.calls.map(([line]: unknown[]) => line)).toStrictEqual([
		'[@ultimabase/access-plugin] allowWithoutRule.all opens every operation and request plugin command on schemas without a rule, for every caller, production included.',
	])
	await t.asMaster(() => Draft.createOne(draft))
	expect(await Draft.findMany({ select: { title: true } })).toMatchObject([
		{ title: 'Notes' },
	])
	expect(await Draft.count()).toBe(1)
	await expect(Draft.createOne(draft)).rejects.toMatchObject(denied)
})

it('opens reads but counts, and writes for authenticated callers', async () => {
	await using t = await testApplication(applicationWith(memberWritesAccess()))
	const { id } = await t.asMaster(() =>
		Member.createOne({ data: { name: 'Ada' } }),
	)
	const member = Member.pointer(id)

	expect(await Draft.findMany()).toStrictEqual([])
	await expect(Draft.count()).rejects.toMatchObject(denied)
	await expect(Draft.createOne(draft)).rejects.toMatchObject(denied)
	expect(
		await t.as(member, () =>
			Draft.createOne({ ...draft, select: { title: true } }),
		),
	).toMatchObject({ title: 'Notes' })
})

it("opens everything with 'development' outside production", async () => {
	await using t = await testApplication(applicationWith(developmentAccess()))

	await Draft.createOne(draft)
	expect(await Draft.count()).toBe(1)
	await t.reset()
})
