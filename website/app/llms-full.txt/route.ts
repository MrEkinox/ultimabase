import { latestPages, markdown } from '../../lib/markdown'

export const revalidate = false

/** Every page of the version `/docs` shows, as Markdown. */
export async function GET(): Promise<Response> {
	const pages = await Promise.all(latestPages().map(markdown.page))
	return new Response(pages.join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	})
}
