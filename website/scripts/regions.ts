// The code a page includes (D-155), read as Fumadocs reads it: a page writes
// `<include cwd>../examples/<file>#<region></include>`, its path resolved from
// `website/`, and gets the lines between `//#region <region>` and its
// `//#endregion`, nested markers left out and the indentation removed.
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

/**
 * An include of a page: the file from `website/`, its region if any, and its
 * code block's meta if any, such as `title="src/models.ts"`.
 */
export interface Include {
	readonly tag: string
	readonly file: string
	readonly region: string | undefined
	readonly meta: string | undefined
}

const tags = /<include(?<attributes>[^>]*)>(?<target>[^<]*)<\/include>/gu
const metas = /\bmeta=(?:'(?<single>[^']*)'|"(?<double>[^"]*)")/u
const start = /^\s*\/\/\s*#?region\b\s*(?<name>.*?)\s*$/u
const end = /^\s*\/\/\s*#?endregion\b\s*(?<name>.*?)\s*$/u

/** The includes of a page, in order. */
export function includesOf(page: string): Include[] {
	return [...page.matchAll(tags)].map((match) => {
		const target = match.groups?.['target']?.trim() ?? ''
		const at = target.lastIndexOf('#')
		const meta = metas.exec(match.groups?.['attributes'] ?? '')?.groups
		return {
			tag: match[0],
			file: at === -1 ? target : target.slice(0, at),
			region: at === -1 ? undefined : target.slice(at + 1),
			meta: meta?.['single'] ?? meta?.['double'],
		}
	})
}

/** Whether an include resolves its path from `website/`, as pages must. */
export const fromWebsite = (include: Include): boolean =>
	/^<include\s+cwd[\s>]/u.test(include.tag)

/** A region's lines, or `undefined` when the file has no such region. */
export function region(content: string, name: string): string | undefined {
	const lines = content.split('\n')
	const from = lines.findIndex(
		(line) => start.exec(line)?.groups?.['name'] === name,
	)
	if (from === -1) return undefined
	const kept: string[] = []
	let depth = 1
	for (const line of lines.slice(from + 1)) {
		if (start.test(line)) depth += 1
		else {
			const closed = end.exec(line)?.groups?.['name']
			if (closed === undefined) kept.push(line)
			else if (closed === name) return dedent(kept)
			else if (closed === '') {
				depth -= 1
				if (depth === 0) return dedent(kept)
			}
		}
	}
	return undefined
}

function dedent(lines: readonly string[]): string {
	const indents = lines
		.filter((line) => line.trim() !== '')
		.map((line) => line.length - line.trimStart().length)
	const indent = Math.min(...indents)
	return Number.isFinite(indent)
		? lines.map((line) => line.slice(indent)).join('\n')
		: lines.join('\n')
}

/** The code block an include stands for, read from `website/`. */
export function codeBlock(website: string, include: Include): string {
	const content = readFileSync(join(website, include.file), 'utf8')
	const code =
		include.region === undefined ? content : region(content, include.region)
	if (code === undefined) {
		throw new Error(`${include.file} has no region "${include.region}"`)
	}
	let fence = '```'
	while (code.includes(fence)) fence += '`'
	const language = extname(include.file).slice(1)
	const meta = include.meta === undefined ? '' : ` ${include.meta}`
	return `${fence}${language}${meta}\n${code.replace(/\r?\n$/u, '')}\n${fence}`
}

/** The part of a Markdown tree `codeEndsAtItsLastLine` reads. */
interface MarkdownNode {
	readonly type: string
	value?: string | undefined
	readonly children?: readonly MarkdownNode[]
}

const endCodeBlocks = (node: MarkdownNode) => {
	if (node.type === 'code') node.value = node.value?.replace(/\r?\n$/u, '')
	node.children?.forEach(endCodeBlocks)
}

/**
 * A remark plugin: a code block ends at its last line. The include plugin keeps
 * the newline that ends a file included whole, which shows as an empty line.
 */
export const codeEndsAtItsLastLine = () => endCodeBlocks
