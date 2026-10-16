// Applies the codemod to the TypeScript and JavaScript code blocks of a
// Markdown or MDX
// document. Blocks between `<!-- region … -->` and `<!-- endregion -->` are
// copies of example regions (ADR-0330): `yarn docs:regions` regenerates them
// from the converted examples, so they are left alone.
import {
	transformSource,
	type CodemodCounts,
	type CodemodFlag,
	type CodemodResult,
	type TransformOptions,
} from './transform.ts'

const fenceOpen = /^(?<indent>[\t ]*)(?<fence>`{3,}|~{3,})(?<language>[\w-]*)/u
const languages = new Map([
	['ts', 'block.ts'],
	['typescript', 'block.ts'],
	['mts', 'block.ts'],
	['cts', 'block.ts'],
	['tsx', 'block.tsx'],
	['js', 'block.js'],
	['javascript', 'block.js'],
	['mjs', 'block.js'],
	['jsx', 'block.jsx'],
])
const regionStart = /^<!-- region \S+ -->$/u
const regionEnd = /^<!-- endregion -->$/u

const addCounts = (total: CodemodCounts, counts: CodemodCounts): void => {
	for (const key of Object.keys(total) as (keyof CodemodCounts)[]) {
		total[key] += counts[key]
	}
}

const dedent = (lines: readonly string[], indent: string): string[] =>
	lines.map((line) =>
		line.startsWith(indent) ? line.slice(indent.length) : line,
	)

/**
 * Converts the `ts`/`tsx`/`js`/`jsx` blocks of one document, outside region-synced
 * blocks. Flag lines are lines of the document.
 *
 * @example `transformMarkdown(readFileSync('README.md', 'utf8')).text`
 */
export const transformMarkdown = (
	markdown: string,
	options: TransformOptions = {},
): CodemodResult => {
	const lines = markdown.split('\n')
	const output: string[] = []
	const counts: CodemodCounts = {
		withObjects: 0,
		shapeMethods: 0,
		withIndexes: 0,
		roleOptions: 0,
	}
	const flags: CodemodFlag[] = []
	let inRegion = false
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? ''
		if (regionStart.test(line.trim())) inRegion = true
		if (regionEnd.test(line.trim())) inRegion = false
		const open = fenceOpen.exec(line)
		output.push(line)
		if (open?.groups === undefined) continue
		const { indent = '', fence = '', language = '' } = open.groups
		const close = lines.findIndex(
			(candidate, position) =>
				position > index &&
				candidate.startsWith(indent) &&
				candidate.slice(indent.length).trimEnd() === fence,
		)
		if (close === -1) continue
		const body = lines.slice(index + 1, close)
		if (inRegion || !languages.has(language)) {
			output.push(...body)
		} else {
			const code = dedent(body, indent).join('\n')
			const result = transformSource(
				code,
				languages.get(language) ?? 'block.ts',
				options,
			)
			addCounts(counts, result.counts)
			// Block line 1 is the line after the opening fence.
			flags.push(
				...result.flags.map((flag) => ({
					...flag,
					line: flag.line + index + 1,
				})),
			)
			output.push(
				...(result.text === code
					? body
					: result.text
							.split('\n')
							.map((codeLine) =>
								codeLine === '' ? '' : `${indent}${codeLine}`,
							)),
			)
		}
		output.push(lines[close] ?? '')
		index = close
	}
	return { text: output.join('\n'), counts, flags }
}
