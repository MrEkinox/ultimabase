// Case-insensitive filters in the contract (D-140): `mode: 'insensitive'`
// on every string operator, beyond ASCII, a pattern character kept.
import type { Adapter, Identity, WhereOf } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Title = defineModel({
	name: 'Title',
	fields: (f) => ({ text: f.string({ optional: true }) }),
})

const texts = async (where: WhereOf<typeof Title>): Promise<unknown[]> =>
	(await Title.findMany({ where, orderBy: { text: 'asc' } }, M)).map(
		(title) => title.text,
	)

export function cases(create: () => Adapter): void {
	describe('case-insensitive filters', () => {
		started(create, [Title])

		beforeEach(async () => {
			for (const text of ['Analysis', 'Compilers', 'Engines', 'Émile', null]) {
				await Title.create({ data: { text } }, M)
			}
		})

		it('ignores case with every string operator', async () => {
			const mode = 'insensitive'
			expect(await texts({ text: { equals: 'analysis', mode } })).toEqual([
				'Analysis',
			])
			expect(await texts({ text: { not: 'ANALYSIS', mode } })).toEqual([
				'Compilers',
				'Engines',
				'Émile',
			])
			expect(await texts({ text: { in: ['ENGINES', 'nope'], mode } })).toEqual([
				'Engines',
			])
			expect(
				await texts({ text: { notIn: ['engines', 'émile'], mode } }),
			).toEqual(['Analysis', 'Compilers'])
			expect(await texts({ text: { contains: 'GIN', mode } })).toEqual([
				'Engines',
			])
			expect(await texts({ text: { startsWith: 'c', mode } })).toEqual([
				'Compilers',
			])
			expect(await texts({ text: { endsWith: 'SIS', mode } })).toEqual([
				'Analysis',
			])
		})

		it('folds letters beyond ASCII', async () => {
			const mode = 'insensitive'
			expect(await texts({ text: { startsWith: 'é', mode } })).toEqual([
				'Émile',
			])
			expect(await texts({ text: { equals: 'ÉMILE', mode } })).toEqual([
				'Émile',
			])
		})

		it('keeps pattern characters as they are', async () => {
			const mode = 'insensitive'
			expect(await texts({ text: { equals: 'analysi_', mode } })).toEqual([])
			expect(await texts({ text: { contains: '%', mode } })).toEqual([])
			expect(await texts({ text: { in: [], mode } })).toEqual([])
			// `mode` alone filters nothing, as in Prisma.
			expect(await texts({ text: { mode } })).toHaveLength(5)
		})
	})
}
