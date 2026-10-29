// The documentation shows only code that works (D-155): a page of `main`
// writes no code but the commands a developer types, includes the rest from
// a region of an example, and the regions it includes show every value a
// package exports. A frozen version holds its code, not includes.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'
import { fromWebsite, includesOf, region } from '../website/scripts/regions.ts'

const website = 'website'

/** Every page under a folder, as `[path, text]`. */
function pagesIn(directory: string): [string, string][] {
	if (!existsSync(directory)) return []
	return readdirSync(directory, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.mdx') || file.endsWith('.md'))
		.map((file) => join(directory, file))
		.map((path) => [path, readFileSync(path, 'utf8')])
}
const pages = pagesIn(join(website, 'content', 'docs'))
const frozen = pagesIn(join(website, 'content', 'versions'))

/** The language of each fenced block of a page. */
function fencesOf(page: string): string[] {
	const languages: string[] = []
	let open: string | undefined
	for (const line of page.split('\n')) {
		const fence = /^\s*(?<marks>`{3,}|~{3,})(?<info>.*)$/u.exec(line)?.groups
		if (fence === undefined) continue
		const marks = fence['marks'] ?? ''
		const info = (fence['info'] ?? '').trim()
		if (open === undefined) {
			open = marks
			languages.push(info.split(/\s/u)[0] ?? '')
		} else if (
			marks[0] === open[0] &&
			marks.length >= open.length &&
			info === ''
		) {
			open = undefined
		}
	}
	return languages
}

it('reads the language of each fenced block', () => {
	const page = [
		'```bash',
		'npm create ultimabase@latest',
		'```',
		'````mdx',
		'```ts',
		'````',
		'~~~ts title="a.ts"',
		'~~~',
	].join('\n')
	expect(fencesOf(page)).toEqual(['bash', 'mdx', 'ts'])
})

/** Where an include's file is from the repository, and its text if any. */
function read(file: string): [string, string | undefined] {
	const path = relative('.', join(website, file))
	return [path, existsSync(path) ? readFileSync(path, 'utf8') : undefined]
}

const starter = 'packages/create-ultimabase/template/'

it('writes no code in a page, and includes only regions that exist', () => {
	const problems = pages.flatMap(([page, text]) => [
		...fencesOf(text)
			.filter((language) => language !== 'bash')
			.map(
				(language) =>
					`${page}: a \`${language}\` block is written in the page; include it from an example.`,
			),
		...includesOf(text).flatMap((include) => {
			const [file, content] = read(include.file)
			// The starter's template is included whole: its files are the
			// developer's, without region markers.
			const template = file.startsWith(starter)
			if (
				!fromWebsite(include) ||
				(template
					? include.region !== undefined
					: !file.startsWith('examples/') || include.region === undefined)
			) {
				return [
					`${page}: ${include.tag} is not <include cwd>../examples/<file>#<region></include>, or a whole file of ${starter}.`,
				]
			}
			if (content === undefined) return [`${page}: ${file} does not exist.`]
			return include.region !== undefined &&
				region(content, include.region) === undefined
				? [`${page}: ${file} has no region \`${include.region}\`.`]
				: []
		}),
	])
	expect(problems).toEqual([])
})

it('holds no include in a frozen version', () => {
	const problems = frozen
		.filter(([, text]) => includesOf(text).length > 0)
		.map(
			([page]) =>
				`${page}: a frozen page holds an include; freeze it with yarn website:freeze.`,
		)
	expect(problems).toEqual([])
})

/** Every value an entry point exports, but `./internal`'s, as `package: name`. */
async function valueExports(): Promise<string[]> {
	const names: string[] = []
	const directories = readdirSync('packages', { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join('packages', entry.name))
	for (const directory of directories) {
		const manifest: unknown = JSON.parse(
			readFileSync(join(directory, 'package.json'), 'utf8'),
		)
		const name: unknown = Reflect.get(Object(manifest), 'name')
		const exports: unknown = Reflect.get(Object(manifest), 'exports')
		const entries =
			typeof exports === 'object' && exports !== null ? exports : {}
		for (const [entry, file] of Object.entries(entries)) {
			if (entry === './internal' || typeof file !== 'string') continue
			const module: unknown = await import(join(process.cwd(), directory, file))
			const values =
				typeof module === 'object' && module !== null ? Object.keys(module) : []
			const from = join(String(name), entry)
			names.push(...values.map((value) => `${from}: ${value}`))
		}
	}
	return names.toSorted()
}

/**
 * The exports no page shows yet. The documentation is being written; this
 * list only shrinks, and is empty before the documentation reaches `main`.
 */
const undocumented: readonly string[] = [
	'@ultimabase/acl: ACL',
	'@ultimabase/acl: acl',
	'@ultimabase/acl: aclPlugin',
	'@ultimabase/auth: authPlugin',
	'@ultimabase/auth: currentUser',
	'@ultimabase/auth: defineUser',
	'@ultimabase/auth: isAuthenticated',
	'@ultimabase/auth: isOwner',
	'@ultimabase/auth: isSelf',
	'@ultimabase/auth: signedIn',
	'@ultimabase/files: file',
	'@ultimabase/files: files',
	'@ultimabase/files: filesPlugin',
	'@ultimabase/files: memoryFiles',
	'@ultimabase/files: s3',
	'@ultimabase/http: clientOf',
	'@ultimabase/http: routes',
	'@ultimabase/live/apollo: ultimabaseLive',
	'@ultimabase/live/react: useLiveSubscription',
	'@ultimabase/live: LiveError',
	'@ultimabase/live: applyLive',
	'@ultimabase/live: liveFetch',
	'@ultimabase/password: password',
	'@ultimabase/password: passwordPlugin',
	'@ultimabase/postgres: postgres',
	'@ultimabase/realtime: realtime',
	'@ultimabase/realtime: realtimePlugin',
	'@ultimabase/rest: rest',
	'@ultimabase/rest: restPlugin',
	'@ultimabase/roles: defineRole',
	'@ultimabase/roles: hasRole',
	'@ultimabase/roles: rolesOf',
	'@ultimabase/roles: rolesPlugin',
	'@ultimabase/soft-delete: softDelete',
	'@ultimabase/soft-delete: softDeletePlugin',
	'@ultimabase/testing: asUser',
	'@ultimabase/testing: testAdapter',
	'ultimabase: CheckFailed',
	'ultimabase: MigrationFailed',
	'ultimabase: OutOfRange',
	'ultimabase: Refused',
	'ultimabase: RelationViolation',
	'ultimabase: UniqueViolation',
	'ultimabase: allOf',
	'ultimabase: anyOf',
	'ultimabase: defineFieldType',
	'ultimabase: definePlugin',
	'ultimabase: feedFields',
	'ultimabase: feedIds',
	'ultimabase: isLocalHost',
	'ultimabase: isMaster',
]

it('shows every value a package exports in an included region', async () => {
	const shown = pages
		.flatMap(([, text]) => includesOf(text))
		.map((include) => {
			const [, content] = read(include.file)
			if (content === undefined) return ''
			return include.region === undefined
				? content
				: (region(content, include.region) ?? '')
		})
		.join('\n')
		// A name a comment cites is not shown in code.
		.replaceAll(/\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/.*$/gmu, '')
	const missing = (await valueExports()).filter((entry) => {
		const value = entry.slice(entry.indexOf(': ') + 2)
		return !new RegExp(`\\b${value}\\b`, 'u').test(shown)
	})
	expect(missing).toEqual(undocumented)
})
