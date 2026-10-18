import { UltimaBase, runWithRequestEngine } from '@ultimabase/core'
import { RequestContext, withContext } from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished } from 'vitest'

import { accessPlugin, isSelf } from '../src/index.js'
import { createFixtureDatabase } from './access-fixtures.test-support.js'

// ADR-0341 decision 4: one rule for "the principal's own row".
const memberId = '0199325a-0c00-7000-8000-000000000341'
const App = UltimaBase.use(accessPlugin())
const Member = App.Schema.define({
	className: 'IsSelfMember',
	// The fields of the fixture row every read returns.
	fields: (field) => ({ secret: field.string(), title: field.string() }),
}).with({ access: { read: isSelf, update: isSelf } })
const Robot = App.Schema.define({
	className: 'IsSelfRobot',
	fields: (field) => ({ name: field.string() }),
}).with({ access: { read: true } })

const start = async () => {
	const database = createFixtureDatabase()
	const ultimabase = new (UltimaBase.use(accessPlugin(), database.plugin))({
		logger: false,
		schemas: [Member, Robot],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	/** Lists Members as `principal`, returning the row filter Access sent. */
	const readAs = async (
		principal: ReturnType<typeof Member.pointer> | undefined,
	) => {
		const context = RequestContext.anonymous({
			requestId: 'is-self',
			source: 'internal',
		}).withPrincipal(principal)
		const before = database.adapter.reads.length
		await runWithRequestEngine(withContext(ultimabase, context), () =>
			Member.findMany(),
		)
		return database.adapter.reads[before]?.rowFilter
	}
	return { readAs, ultimabase }
}

describe('isSelf (ADR-0341)', () => {
	it("matches the principal's own row when it points to the schema", async () => {
		const { readAs, ultimabase } = await start()
		await expect(readAs(Member.pointer(memberId))).resolves.toEqual({
			field: 'id',
			kind: 'equal',
			value: memberId,
		})
		await expect(
			ultimabase.can({
				operation: 'update',
				principal: Member.pointer(memberId),
				schema: Member,
			}),
		).resolves.toBe(true)
	})

	it('denies without a principal or with one of another schema', async () => {
		const { readAs, ultimabase } = await start()
		await expect(readAs(undefined)).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		for (const principal of [undefined, Robot.pointer(memberId)]) {
			await expect(
				ultimabase.can({ operation: 'findMany', principal, schema: Member }),
			).resolves.toBe(false)
		}
	})
})
