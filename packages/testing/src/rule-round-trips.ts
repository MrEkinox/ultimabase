// The round trips of a user's write under rules (D-342): a rule's filter is
// one of the write's checks, counted again after the write only when the
// write changes a field it reads; a rule that reads the row loads it (D-104).
import type { Adapter } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { suiteUser } from './as-user.ts'
import { started } from './suite.ts'

const M = { as: master }
const me = '00000000-0000-4000-8000-000000000000'
const user = { as: suiteUser(me) }

/** A model whose update rule filters, and whose delete rule reads the row. */
const Tray = defineModel({
	name: 'Tray',
	fields: (f) => ({ owner: f.string(), label: f.string() }),
}).with({
	access: {
		read: () => true,
		update: ({ caller, where }) =>
			caller.kind === 'user' && where({ owner: { equals: caller.user.id } }),
		delete: ({ caller, record }) =>
			caller.kind === 'user' && record.owner === caller.user.id,
	},
})

export function ruleRoundTrips(
	create: () => Adapter,
	counted: () => number,
): void {
	const trips = async (expected: number, run: () => Promise<unknown>) => {
		const before = counted()
		await run()
		expect(counted() - before).toBe(expected)
	}

	describe("the round trips of a user's write under rules", () => {
		started(create, [Tray])

		it("checks a user's write by its rule's filter in the write", async () => {
			const { id } = await Tray.create({ data: { owner: me, label: 'a' } }, M)
			// The filter is one of the write's checks.
			await trips(1, async () =>
				Tray.update({ where: { id }, data: { label: 'b' } }, user),
			)
			// BEGIN, the write and its checks, the filter counted after, COMMIT.
			await trips(4, async () =>
				Tray.update({ where: { id }, data: { owner: me } }, user),
			)
			// BEGIN, the locked row, the write, COMMIT.
			await trips(4, async () => Tray.delete({ where: { id } }, user))
			expect(await Tray.count({}, M)).toBe(0)
		})
	})
}
