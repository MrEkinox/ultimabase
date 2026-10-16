// Runs the ADR-0339 codemod over files and directories:
//
//   node tooling/codemods/define-with/run.ts [--write] [--report <file.json>]
//     [--skip <path>]... [--feature <name>]... <path>...
//
// Without `--write` it only reports. TypeScript and JavaScript files (`.ts`,
// `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, not `.d.ts`) are
// converted whole; Markdown and MDX files have their TypeScript and
// JavaScript blocks converted, except region-synced README blocks.
// `--feature` names a community shape method to convert besides `acl` and
// `softDelete`. Format the written files afterwards (`prettier --write`).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { transformMarkdown } from './markdown.ts'
import {
	transformSource,
	type CodemodCounts,
	type CodemodFlag,
	type CodemodResult,
} from './transform.ts'

const skippedDirectories = new Set([
	'.next',
	'.source',
	'coverage',
	'dist',
	'gen',
	'node_modules',
])
const sourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u
const documentPattern = /\.mdx?$/u

interface FileReport {
	readonly file: string
	readonly counts: CodemodCounts
	readonly flags: readonly CodemodFlag[]
}

const readArguments = (
	argv: readonly string[],
): {
	write: boolean
	report: string | undefined
	skip: string[]
	features: string[]
	roots: string[]
} => {
	const options = {
		write: false,
		report: undefined as string | undefined,
		skip: [] as string[],
		features: ['acl', 'softDelete'],
		roots: [] as string[],
	}
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index] ?? ''
		if (argument === '--write') options.write = true
		else if (argument === '--report') options.report = argv[(index += 1)]
		else if (argument === '--feature')
			options.features.push(argv[(index += 1)] ?? '')
		else if (argument === '--skip')
			options.skip.push(path.resolve(argv[(index += 1)] ?? ''))
		else options.roots.push(argument)
	}
	return options
}

const collectFiles = (root: string, skip: readonly string[]): string[] => {
	const absolute = path.resolve(root)
	if (
		skip.some(
			(skipped) =>
				absolute === skipped || absolute.startsWith(`${skipped}${path.sep}`),
		)
	) {
		return []
	}
	if (!statSync(absolute).isDirectory()) return [absolute]
	return readdirSync(absolute, { withFileTypes: true })
		.filter((entry) => !skippedDirectories.has(entry.name))
		.flatMap((entry) => collectFiles(path.join(absolute, entry.name), skip))
		.filter(
			(file) =>
				(sourcePattern.test(file) && !file.endsWith('.d.ts')) ||
				documentPattern.test(file),
		)
}

const { write, report, skip, features, roots } = readArguments(
	process.argv.slice(2),
)
const transformFile = (file: string, text: string): CodemodResult =>
	documentPattern.test(file)
		? transformMarkdown(text, { features })
		: transformSource(text, file, { features })

if (roots.length === 0) {
	console.error(
		'Usage: run.ts [--write] [--report <file.json>] [--skip <path>]... [--feature <name>]... <path>...',
	)
	process.exit(2)
}
const reports: FileReport[] = []
const total: CodemodCounts = {
	withObjects: 0,
	shapeMethods: 0,
	withIndexes: 0,
	roleOptions: 0,
}
let changedFiles = 0
for (const file of [
	...new Set(roots.flatMap((root) => collectFiles(root, skip))),
]) {
	const text = readFileSync(file, 'utf8')
	const result = transformFile(file, text)
	const relative = path.relative(process.cwd(), file)
	if (result.text !== text) {
		changedFiles += 1
		if (write) writeFileSync(file, result.text)
	}
	for (const key of Object.keys(total) as (keyof CodemodCounts)[]) {
		total[key] += result.counts[key]
	}
	if (result.text !== text || result.flags.length > 0) {
		reports.push({ file: relative, counts: result.counts, flags: result.flags })
	}
	for (const flag of result.flags) {
		console.info(
			`${relative}:${String(flag.line)} ${flag.kind}: ${flag.snippet}`,
		)
	}
}
console.info(
	`${write ? 'Changed' : 'Would change'} ${String(changedFiles)} file(s): ${JSON.stringify(total)}`,
)
if (report !== undefined) {
	writeFileSync(
		report,
		`${JSON.stringify({ total, files: reports }, null, '\t')}\n`,
	)
}
