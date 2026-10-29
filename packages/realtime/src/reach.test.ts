// Where a live read reaches (D-154): its filter's levels, negative under a
// lost link, and the relations its selection shows.
import { describe, expect, it } from 'vitest'
import type { Level } from './reach.ts'
import { modelsOf, reachOf, walk } from './reach.ts'
import { schema } from './test/schema.ts'

const models = modelsOf(schema)

/** Each level as its path, its fields and whether it is negative. */
const levelsOf = (
	where: Parameters<typeof walk>[2],
): readonly (readonly [string, readonly string[] | 'all', boolean])[] => {
	const levels: Level[] = []
	walk(models, 'Post', where, [], false, levels)
	return levels.map(({ steps, fields, negative }) => [
		steps.map(({ relation }) => relation).join('.'),
		fields === 'all' ? 'all' : [...fields].toSorted(),
		negative,
	])
}

describe('a filter', () => {
	it('reads each level, negative under a link that may be lost', () => {
		expect(
			levelsOf({
				label: undefined,
				title: { equals: 'a' },
				team: { is: { name: { equals: 'One' } } },
				comments: { none: { text: { equals: 'spam' } } },
				NOT: [{ tags: { some: {} } }],
			}),
		).toEqual([
			['team', ['name', 'posts'], false],
			['comments', ['post', 'text'], true],
			['tags', ['posts'], true],
			['', ['comments', 'tags', 'team', 'title'], false],
		])
	})

	it('loses a link through is: null, isNot and every, not isNot: null', () => {
		expect(
			levelsOf({
				team: { is: null, isNot: null },
				comments: { every: { text: { equals: 'a' } } },
				tags: { isNot: { label: { equals: 'x' } } },
			}),
		).toEqual([
			['team', ['posts'], true],
			['team', ['posts'], false],
			['comments', ['post', 'text'], true],
			['tags', ['label', 'posts'], true],
			['', ['comments', 'tags', 'team'], false],
		])
	})

	it('reads every field to search', () => {
		expect(levelsOf({ _search: { search: 'cat' } })).toEqual([
			['', 'all', false],
		])
	})
})

describe('a selection', () => {
	const plan = {
		where: { title: { equals: 'a' } },
		rights: undefined,
		orderBy: [{ field: 'title', direction: 'asc' as const }],
	}

	it('shows every field when it lists none', () => {
		const reach = reachOf(schema, 'Post', plan)
		expect(reach.showing).toBe('all')
		expect(reach.placing).toEqual(new Set(['title']))
		expect(reach.shown).toEqual([])
	})

	it('shows nested relations, deep when their filter or order reaches further', () => {
		const reach = reachOf(schema, 'Team', {
			...plan,
			where: undefined,
			fields: ['id', 'name'],
			include: {
				title: {},
				posts: {
					where: { tags: { some: {} } },
					orderBy: [
						{
							field: 'name',
							direction: 'asc',
							through: [{ relation: 'team' }],
						},
						{ field: 'title', direction: 'asc', through: [{ relation: 'x' }] },
						{ field: 'comments', direction: 'desc', count: {} },
						{ field: 'title', direction: 'desc', count: {} },
					],
					include: { comments: { fields: ['id', 'text'] } },
					count: { title: {}, tags: { label: { equals: 'x' } } },
				},
			},
			count: { posts: {} },
		})
		expect(reach.showing).toEqual(new Set(['id', 'name', 'title', 'posts']))
		expect(
			reach.shown.map(({ path, model, fields, counted }) => [
				path,
				model,
				fields === 'all' ? 'all' : [...fields].toSorted(),
				counted,
			]),
		).toEqual([
			['posts', 'Post', 'all', false],
			['posts.comments', 'Comment', ['id', 'post', 'text'], false],
			['posts._count.tags', 'Tag', ['label', 'posts'], true],
			['_count.posts', 'Post', ['team'], true],
		])
		expect([...reach.deep].toSorted()).toEqual([
			'Comment',
			'Post',
			'Tag',
			'Team',
		])
	})
})
