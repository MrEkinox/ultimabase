import {
	renderPlaceholder,
	type PlaceholderData,
} from 'fumadocs-core/mdx-plugins/remark-llms.runtime'

function stringAttribute(
	data: PlaceholderData,
	name: string,
): string | undefined {
	const value = data.attributes[name]
	return typeof value === 'string' ? value : undefined
}

function renderCallout(data: PlaceholderData): string {
	const title = stringAttribute(data, 'title') ?? 'Note'
	const body = data.children.trim().replace(/\n/g, '\n> ')
	return `\n> **${title}**\n>\n> ${body}\n`
}

function renderCard(data: PlaceholderData): string {
	const title = stringAttribute(data, 'title') ?? 'Read more'
	const href = stringAttribute(data, 'href')
	const description = stringAttribute(data, 'description')
	const heading = href ? `[${title}](${href})` : `**${title}**`
	return `\n- ${heading}${description ? ` — ${description}` : ''}${
		data.children.trim()
			? `\n\n  ${data.children.trim().replace(/\n/g, '\n  ')}`
			: ''
	}\n`
}

function renderCodeTab(data: PlaceholderData): string {
	const label = stringAttribute(data, 'value') ?? 'Example'
	const code = data.children
		.trim()
		.replace(
			/^```([^\n]*)\n/u,
			(_match, info: string) => `\`\`\`${info.trim()}\n`,
		)
	return `\n**${label}**\n\n${code}\n`
}

function renderFolder(data: PlaceholderData): string {
	const name = stringAttribute(data, 'name') ?? 'folder'
	const children = data.children
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => `  ${line}`)
		.join('\n')
	return `- ${name}/\n${children}\n`
}

function renderMermaid(data: PlaceholderData): string {
	const description = stringAttribute(data, 'description')
	const chart = stringAttribute(data, 'chart')
	return `\n${description ? `${description}\n\n` : ''}${chart ? `\`\`\`mermaid\n${chart.trim()}\n\`\`\`` : ''}\n`
}

/** Keep the reader-facing Markdown semantic while stripping docs UI components. */
export async function renderDocumentationMarkdown(
	markdown: string,
): Promise<string> {
	return renderPlaceholder(markdown, {
		Callout: renderCallout,
		Card: renderCard,
		Cards: ({ children }) => `\n${children.trim()}\n`,
		CodeBlockTab: renderCodeTab,
		CodeBlockTabs: ({ children }) => `\n${children.trim()}\n`,
		CodeBlockTabsList: () => '',
		CodeBlockTabsTrigger: () => '',
		File: (data) => `- ${stringAttribute(data, 'name') ?? 'file'}\n`,
		Files: ({ children }) => `\n${children.trim()}\n`,
		Folder: renderFolder,
		Mermaid: renderMermaid,
	})
}
