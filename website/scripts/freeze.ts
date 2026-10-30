// Freezes the pages of `main` as the version `ultimabase` is at (D-155): its
// minor version's folder in `content/versions` is replaced by a copy of
// `content/docs`, each include written out as the code block it stands for,
// so a published version no longer changes with the examples.
import {
	cpSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { codeBlock, includesOf } from './regions.ts'

const website = '.'
const manifest: unknown = JSON.parse(
	readFileSync(join('..', 'packages', 'ultimabase', 'package.json'), 'utf8'),
)
const version: unknown = Reflect.get(Object(manifest), 'version')
const minor =
	typeof version === 'string' ? /^\d+\.\d+/u.exec(version)?.[0] : undefined
if (minor === undefined) throw new Error(`Not a version: ${String(version)}`)

const target = join('content', 'versions', minor)
rmSync(target, { recursive: true, force: true })
cpSync(join('content', 'docs'), target, { recursive: true })

function inline(directory: string): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) inline(path)
		else if (entry.name.endsWith('.mdx')) {
			const page = readFileSync(path, 'utf8')
			const frozen = includesOf(page).reduce(
				// A function, so that a `$` in the code is not a pattern.
				(text, include) =>
					text.replace(include.tag, () => codeBlock(website, include)),
				page,
			)
			writeFileSync(path, frozen)
		}
	}
}
inline(target)

// The version names its tab in the sidebar.
const meta = join(target, 'meta.json')
const root: unknown = JSON.parse(readFileSync(meta, 'utf8'))
writeFileSync(
	meta,
	`${JSON.stringify({ ...Object(root), title: minor, description: `Version ${minor}` }, undefined, '\t')}\n`,
)
console.log(`Froze the pages of main as ${target}`)
