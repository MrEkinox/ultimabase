// Classifies the TypeScript and JavaScript blocks of the documentation
// (ADR-0330): each one is an included example region, a compiled snippet, or
// explicitly marked unverified. Anything else is `unmarked`.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractCodeRegion } from '../../../tooling/documentation/code-regions.ts'

export const repositoryRoot = fileURLToPath(
	new URL('../../..', import.meta.url),
)
/** Where `<include cwd>` paths start: the Fumadocs collection root. */
export const websiteRoot = fileURLToPath(new URL('..', import.meta.url))

export type CodeBlockKind = 'included' | 'compiled' | 'unverified' | 'unmarked'

export interface CodeBlock {
	readonly kind: CodeBlockKind
	/** 1-based line of the fence or `<include>` in its document. */
	readonly line: number
	/** For an included region: the resolved source file and region name. */
	readonly region?: { readonly file: string; readonly name: string }
}

/** The fence meta flag of a block that is deliberately not verified. */
export const unverifiedFlag = 'unverified'
/** The fence meta flag of a snippet compiled with hover types by Twoslash. */
export const compiledFlag = 'twoslash'

const scriptLanguage =
	/^(?:ts|tsx|mts|cts|typescript|js|jsx|mjs|cjs|javascript)$/u
const fencePattern = /^(?<indent>\s*)(?<fence>`{3,}|~{3,})(?<info>.*)$/u
const includePattern =
	/<include(?<attributes>[^>]*)>\s*(?<target>[^<\s]+)\s*<\/include>/gu
const readmeRegionPattern =
	/^<!-- region (?<target>\S+)#(?<names>[\w,-]+) -->$/u

const isScriptFile = (file: string) =>
	scriptLanguage.test(path.extname(file).slice(1))

const lineOf = (source: string, index: number) =>
	source.slice(0, index).split('\n').length

const resolveRegion = (target: string, base: string) => {
	const hash = target.lastIndexOf('#')
	if (hash === -1) return { file: path.resolve(base, target), name: '' }
	return {
		file: path.resolve(base, target.slice(0, hash)),
		name: target.slice(hash + 1),
	}
}

/**
 * Lists the script blocks of one MDX page or Markdown README. MDX `<include>`
 * elements count as included regions; in Markdown, a fence between
 * `<!-- region … -->` markers does (see `yarn docs:regions`).
 */
export const classifyCodeBlocks = (
	document: string,
	source: string = readFileSync(document, 'utf8'),
): readonly CodeBlock[] => {
	const blocks: CodeBlock[] = []
	for (const match of source.matchAll(includePattern)) {
		const { attributes = '', target = '' } = match.groups ?? {}
		const region = resolveRegion(
			target,
			/\bcwd\b/u.test(attributes) ? websiteRoot : path.dirname(document),
		)
		if (!isScriptFile(region.file) && !/\blang=/u.test(attributes)) continue
		blocks.push({ kind: 'included', line: lineOf(source, match.index), region })
	}
	let open: { readonly fence: string; readonly info: string } | undefined
	let readmeRegion = false
	source.split('\n').forEach((text, index) => {
		const fence = fencePattern.exec(text)?.groups
		if (open !== undefined) {
			if (fence?.fence?.startsWith(open.fence) && fence.info?.trim() === '')
				open = undefined
			return
		}
		if (readmeRegionPattern.test(text)) readmeRegion = true
		if (text === '<!-- endregion -->') readmeRegion = false
		if (fence?.fence === undefined) return
		const info = (fence.info ?? '').trim()
		open = { fence: fence.fence, info }
		const [language = '', ...meta] = info.split(/\s+/u)
		if (!scriptLanguage.test(language)) return
		const kind: CodeBlockKind = readmeRegion
			? 'included'
			: meta.includes(compiledFlag)
				? 'compiled'
				: meta.includes(unverifiedFlag)
					? 'unverified'
					: 'unmarked'
		blocks.push({ kind, line: index + 1 })
	})
	return blocks.sort((left, right) => left.line - right.line)
}

/** Returns why an included region cannot be shown, or `undefined` when it can. */
export const regionProblem = (block: CodeBlock): string | undefined => {
	if (block.region === undefined) return undefined
	const { file, name } = block.region
	if (!existsSync(file))
		return `missing file ${path.relative(repositoryRoot, file)}`
	if (name === '') return undefined
	try {
		extractCodeRegion(readFileSync(file, 'utf8'), name)
		return undefined
	} catch (error) {
		return error instanceof Error ? error.message : String(error)
	}
}

const listFiles = (directory: string, extension: string): string[] =>
	readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(extension))
		.map((entry) => path.join(entry.parentPath, entry.name))

/** Every public page, then the root, package and example READMEs. */
export const listDocumentationFiles = (): readonly string[] => [
	...listFiles(path.join(websiteRoot, 'content/docs'), '.mdx').sort(),
	path.join(repositoryRoot, 'README.md'),
	...['packages', 'examples'].flatMap((root) =>
		readdirSync(path.join(repositoryRoot, root))
			.map((name) => path.join(repositoryRoot, root, name, 'README.md'))
			.filter((file) => existsSync(file))
			.sort(),
	),
]
