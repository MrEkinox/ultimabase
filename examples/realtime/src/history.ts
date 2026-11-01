// A list longer than a live list should be: the first tasks live, the ones
// past maxLive read once with ordinary queries.
//#region history
import { LiveError, liveFetch } from '@ultimabase/live'
import { z } from 'zod'

const task = z.object({ id: z.string(), title: z.string() })
const pageOf = z.object({
	edges: z.array(z.object({ node: task })),
	pageInfo: z.object({
		hasNextPage: z.boolean(),
		endCursor: z.string().nullable(),
	}),
})
type Task = z.infer<typeof task>
type Page = z.infer<typeof pageOf>

const orderBy = encodeURIComponent('[{"rank":"asc"}]')

/** The tasks at `url`, the first 25 live; `more` shows 25 more. */
export function history(url: string) {
	const live = liveFetch<Page>(`${url}/api/tasks?first=25&orderBy=${orderBy}`)
	let latest: Page | undefined
	const stop = live.subscribe((page) => {
		latest = page
	})
	let older: readonly Task[] = []
	// Where the older tasks go on, once the live list stopped growing.
	let after: string | null | undefined

	/** Grows the live list, then, past its limit, reads the next tasks once. */
	async function more(): Promise<void> {
		if (after === undefined) {
			try {
				return await live.fetchMore({ first: 25 })
			} catch (error) {
				if (!(error instanceof LiveError) || !error.details?.['limit']) {
					throw error
				}
				after = latest?.pageInfo.endCursor ?? null
			}
		}
		if (after === null) return
		const response = await fetch(
			`${url}/api/tasks?first=25&orderBy=${orderBy}&after=${after}`,
		)
		const page = pageOf.parse(await response.json())
		older = [...older, ...page.edges.map(({ node }) => node)]
		after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
	}

	const shown = (): readonly Task[] => [
		...(latest?.edges.map(({ node }) => node) ?? []),
		...older,
	]
	return { shown, more, stop }
}
//#endregion
