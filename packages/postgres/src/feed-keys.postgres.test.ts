// A delete's change on postgres() tells the stored keys of its rows (D-196),
// within pg_notify's 8000 bytes however many keys, or long, a model has.
import { testApplication } from '@ultimabase/testing'
import type { Changed } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { describe, expect, it, vi } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const database = createAdapter({ url: server })

const Card = defineModel({
	name: 'Card',
	fields: (f) => ({ title: f.string() }),
})

/** `count` field names, `prefix` then their rank. */
const named = (prefix: string, count: number): string[] =>
	Array.from({ length: count }, (_, at) => `${prefix}${String(at)}`)

const edge = named('k', 99)
const wide = named('k', 100)
const long = named('a'.repeat(56), 98)

/** A model of optional keys to a card, one per name. */
const keyed = (name: string, names: readonly string[]) =>
	defineModel({
		name,
		fields: (f) =>
			Object.fromEntries(
				names.map((field) => [field, f.one(() => Card, { optional: true })]),
			),
	})

const Edge = keyed('Edge', edge)
const Wide = keyed('Wide', wide)
const Long = keyed('Long', long)

const seen: Changed[] = []
const watcher = definePlugin({
	name: 'watcher',
	manifest: {
		name: 'watcher',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	changed: (changes) => {
		seen.push(...changes)
	},
})

describe("a delete's change on postgres()", () => {
	testApplication(
		defineApp({
			database,
			models: [Card, Edge, Wide, Long],
			plugins: [watcher.plugin()],
		}),
		{ database: 'declared' },
	)

	// Past 99 keys, or 1,500 bytes of names, the ids come alone.
	it.each([
		['99 keys, with its keys', Edge, edge, true],
		['100 keys, without', Wide, wide, false],
		['98 long keys, without', Long, long, false],
	] as const)('is told for a model of %s', async (_, model, names, told) => {
		const card = await Card.create({ data: { title: 'c' } }, M)
		const data = Object.fromEntries(
			names.map((field) => [field, { connect: { id: card.id } }]),
		)
		const { id } = await model.create({ data }, M)
		await model.delete({ where: { id } }, M)
		const keys = told
			? Object.fromEntries(names.map((field) => [field, [card.id]]))
			: undefined
		await vi.waitFor(() =>
			expect(
				seen.find(
					(change) => change.kind === 'delete' && change.model === model.name,
				),
			).toStrictEqual({
				kind: 'delete',
				model: model.name,
				ids: [id],
				...(keys && { keys }),
			}),
		)
	})
})
