import { documentationMarkdown } from '../../lib/source'

export const revalidate = false

/** Provide the same processed Markdown as the individual reader pages in one file. */
export async function GET() {
	return new Response(await documentationMarkdown.full(), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	})
}
