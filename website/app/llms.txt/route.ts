import { latestPages } from '../../lib/markdown'

export const revalidate = false

/** The pages of the version `/docs` shows, each with its Markdown copy. */
export function GET(): Response {
	const pages = latestPages()
		.map(
			(page) =>
				`- [${page.data.title}](${page.url}.md): ${page.data.description ?? ''}`,
		)
		.join('\n')
	const text = `# UltimaBase\n\n> A TypeScript backend built from a small kernel and its plugins.\n\nEach page is also served as Markdown at its URL with \`.md\` appended; [all of them in one file](/llms-full.txt).\n\n## Documentation\n\n${pages}\n`
	return new Response(text, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	})
}
