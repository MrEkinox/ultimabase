// What the tests do around a subscription, so that their short regions, shown
// on the page, hold only what a developer writes (D-282).
import { master } from 'ultimabase'
import { Task } from './models.ts'

/** What a test writes with, with no access rule in its way. */
export const M = { as: master } as const

/** The `tasks` list a subscription of `tasks` selects. */
export type Tasks = {
	readonly tasks: {
		readonly edges: readonly {
			readonly node: { readonly id: string; readonly title: string }
		}[]
	}
}

/** The next result of a subscription. */
export async function next<T>(results: AsyncIterator<T>): Promise<T> {
	const result = await results.next()
	if (result.done === true) throw new Error('The subscription completed.')
	return result.value
}

/** The titles of a list's rows. */
export function titles(list: Tasks['tasks'] | undefined) {
	return list?.edges.map(({ node }) => node.title)
}

/** Tasks a, b and c, ranked 1 to 3; their ids. */
export async function seeded(): Promise<string[]> {
	const ids: string[] = []
	for (const [rank, title] of [
		[1, 'a'],
		[2, 'b'],
		[3, 'c'],
	] as const) {
		ids.push((await Task.create({ data: { title, rank } }, M)).id)
	}
	return ids
}
