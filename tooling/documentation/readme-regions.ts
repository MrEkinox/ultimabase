// Copies named example regions into Markdown files between markers (ADR-0330):
//
//   <!-- region ../../examples/soft-delete/src/schema.ts#factory,post -->
//
//   ```ts
//   (generated)
//   ```
//
//   <!-- endregion -->
//
// The path is relative to the Markdown file, like a Markdown link and like
// Fumadocs `<include>`. Several comma-separated regions of one file become one
// block, separated by a blank line.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { extractCodeRegion } from './code-regions.ts'

/** Markdown files that may hold region markers, relative to the repository. */
const regionDocumentRoots = ['packages', 'examples'] as const

const markerPattern =
	/^<!-- region (?<target>\S+)#(?<names>[\w,-]+) -->\n[\s\S]*?^<!-- endregion -->$/gmu

const languageOf = (file: string): string =>
	path
		.extname(file)
		.slice(1)
		.replace(/^[cm]([jt]s)$/u, '$1')

const renderBlock = (
	target: string,
	names: string,
	documentPath: string,
	readSource: (file: string) => string,
): string => {
	const file = path.resolve(path.dirname(documentPath), target)
	const source = readSource(file)
	const code = names
		.split(',')
		.map((name) => extractCodeRegion(source, name))
		.join('\n\n')
	// Blank lines around the fence keep the block stable under Prettier.
	return [
		`<!-- region ${target}#${names} -->`,
		'',
		`\`\`\`${languageOf(file)}`,
		code,
		'```',
		'',
		'<!-- endregion -->',
	].join('\n')
}

/** Returns the document with every marker block regenerated from its source. */
export const renderRegionMarkers = (
	markdown: string,
	documentPath: string,
	readSource: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): string => {
	let rendered = ''
	let copied = 0
	for (const match of markdown.matchAll(markerPattern)) {
		const { names = '', target = '' } = match.groups ?? {}
		rendered += markdown.slice(copied, match.index)
		rendered += renderBlock(target, names, documentPath, readSource)
		copied = match.index + match[0].length
	}
	return rendered + markdown.slice(copied)
}

/** The Markdown files that may hold markers: package and example READMEs. */
export const listRegionDocuments = (
	repositoryRoot: string,
): readonly string[] =>
	regionDocumentRoots.flatMap((root) =>
		readdirSync(path.join(repositoryRoot, root), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(repositoryRoot, root, entry.name, 'README.md'))
			.filter((file) => existsSync(file)),
	)
