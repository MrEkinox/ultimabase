import { documentationMarkdown } from '../../lib/source'
import { siteConfig } from '../../lib/site'

export const revalidate = false

/** List every versioned reader page for agents that start at the site root. */
export async function GET() {
	const index = (await documentationMarkdown.index()).replace(
		/^# [^\n]+/u,
		'## Documentation index',
	)
	const content = `# ${siteConfig.name} documentation\n\n${siteConfig.description}\n\nThis documentation covers a pre-release framework. Check [Release Status](${siteConfig.routes.releaseStatus}) before treating a planned capability as available.\n\nEach page below also has a Markdown copy at its URL with \`.md\` appended. [Read the complete documentation](/llms-full.txt).\n\n${index}\n`
	return new Response(content, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	})
}
