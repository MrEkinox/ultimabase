// The code a page includes (D-155), read as Fumadocs reads it: a page writes
// `<include cwd>../examples/<file>#<region></include>`, its path resolved from
// `website/`, and gets the lines between `//#region <region>` and its
// `//#endregion`, nested markers left out and the indentation removed.
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

/** An include of a page: the file from `website/`, and its region if any. */
export interface Include {
	readonly tag: string
	readonly file: string
	readonly region: string | undefined
}

const tags = /<include(?<attributes>[^>]*)>(?<target>[^<]*)<\/include>/gu
const start = /^\s*\/\/\s*#?region\b\s*(?<name>.*?)\s*$/u
const end = /^\s*\/\/\s*#?endregion\b\s*(?<name>.*?)\s*$/u

/** The includes of a page, in order. */
export function includesOf(page: string): Include[] {
	return [...page.matchAll(tags)].map((match) => {
		const target = match.groups?.['target']?.trim() ?? ''
		const at = target.lastIndexOf('#')
		return {
			tag: match[0],
			file: at === -1 ? target : target.slice(0, at),
			region: at === -1 ? undefined : target.slice(at + 1),
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
	return `${fence}${language}\n${code.replace(/\r?\n$/u, '')}\n${fence}`
}
