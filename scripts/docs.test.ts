// The documentation shows only code that works (D-155): a page of `main`
// writes no code but the commands a developer types, includes the rest from
// a region of an example, and the regions it includes show every value a
// package exports. A frozen version holds its code, not includes.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
	API,
	SignatureKind,
	SymbolFlags,
	TypeFlags,
} from 'typescript/unstable/sync'
import type { Checker, Type } from 'typescript/unstable/sync'
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
		// Shell commands; an `npm` block shows a tab per package manager.
		...fencesOf(text)
			.filter((language) => language !== 'bash' && language !== 'npm')
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

const examples =
	'https://github.com/MrEkinox/ultimadatabase/tree/main/examples/'

it("shows a page's first file with its imports, and links to its example", () => {
	const problems = pages.flatMap(([page, text]) => {
		const [first] = includesOf(text)
		// The starter's files are included whole.
		if (first?.region === undefined) return []
		const [file, content = ''] = read(first.file)
		const shown = region(content, first.region) ?? ''
		const imports = content.match(/^import [\s\S]*?from '[^']+'$/gmu) ?? []
		const example = `${examples}${file.split('/')[1] ?? ''}`
		return [
			...imports
				.filter((statement) => !shown.includes(statement))
				.map(
					(statement) =>
						`${page}: ${file}#${first.region} leaves out \`${statement.split('\n')[0] ?? ''}\`; start the region above the imports.`,
				),
			...(text.includes(`](${example})`)
				? []
				: [`${page}: no link to ${example}.`]),
		]
	})
	expect(problems).toEqual([])
})

/** The landing page and the sections it assembles, as `[path, text]`. */
const landing: [string, string][] = [
	join(website, 'app', 'page.tsx'),
	...readdirSync(join(website, 'components', 'landing'))
		.filter((file) => file.endsWith('.tsx'))
		.map((file) => join(website, 'components', 'landing', file)),
].map((path) => [path, readFileSync(path, 'utf8')])

/** The `file` and `region` of each `<Example>` a landing file shows. */
function examplesOf(page: string): { file: string; region: string }[] {
	return [...page.matchAll(/<Example\b[^>]*>/gu)].map(([tag]) => ({
		file: /\bfile="(?<value>[^"]*)"/u.exec(tag)?.groups?.['value'] ?? '',
		region: /\bregion="(?<value>[^"]*)"/u.exec(tag)?.groups?.['value'] ?? '',
	}))
}

it("reads an <Example>'s file and region in any order", () => {
	const page = '<Example\n\tregion="post"\n\tfile="a/b.ts"\n/>'
	expect(examplesOf(page)).toEqual([{ file: 'a/b.ts', region: 'post' }])
})

it('shows on the landing page only regions that exist', () => {
	const shown = landing.flatMap(([path, text]) =>
		examplesOf(text).map((example) => ({ path, ...example })),
	)
	const problems = [
		...(shown.length === 0 ? ['The landing page shows no <Example>.'] : []),
		...shown
			.filter(({ file, region: name }) => {
				const path = join('examples', file)
				return (
					!existsSync(path) ||
					region(readFileSync(path, 'utf8'), name) === undefined
				)
			})
			.map(
				({ path, file, region: name }) =>
					`${path}: examples/${file} has no region "${name}".`,
			),
	]
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

/** Each entry point but `./internal`, as `[package and entry, file]`. */
function entryPoints(): [string, string][] {
	const entries: [string, string][] = []
	const directories = readdirSync('packages', { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join('packages', entry.name))
	for (const directory of directories) {
		const manifest: unknown = JSON.parse(
			readFileSync(join(directory, 'package.json'), 'utf8'),
		)
		const name: unknown = Reflect.get(Object(manifest), 'name')
		const exports: unknown = Reflect.get(Object(manifest), 'exports')
		const files = typeof exports === 'object' && exports !== null ? exports : {}
		for (const [entry, file] of Object.entries(files)) {
			if (entry === './internal' || typeof file !== 'string') continue
			entries.push([join(String(name), entry), join(directory, file)])
		}
	}
	return entries
}

/** Every value an entry point exports, as `package: name`. */
async function valueExports(): Promise<string[]> {
	const names: string[] = []
	for (const [from, file] of entryPoints()) {
		const module: unknown = await import(join(process.cwd(), file))
		const values =
			typeof module === 'object' && module !== null ? Object.keys(module) : []
		names.push(...values.map((value) => `${from}: ${value}`))
	}
	return names.toSorted()
}

/** The object types of a type, each member of a union. */
function objectsOf(checker: Checker, type: Type): Type[] {
	if (type.flags & TypeFlags.Union) {
		const members = checker.getNonNullableType(type) ?? type
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeFlags.Union marks a UnionType.
		const union = members as Type & { getTypes(): readonly Type[] }
		return members.flags & TypeFlags.Union
			? union.getTypes().flatMap((member) => objectsOf(checker, member))
			: objectsOf(checker, members)
	}
	const object = type.flags & (TypeFlags.Object | TypeFlags.Intersection)
	const callable =
		checker.getSignaturesOfType(type, SignatureKind.Call).length > 0
	return object && !callable && !checker.isArrayLikeType(type) ? [type] : []
}

/**
 * The options of each exported function, as `package: function option`: the
 * properties of its `options` or `definition` parameter, from the compiler.
 */
function exportedOptions(): string[] {
	const root = process.cwd()
	const api = new API({ cwd: root })
	try {
		const [project] = api
			.updateSnapshot({ openProjects: [join(root, 'tsconfig.json')] })
			.getProjects()
		if (project === undefined)
			throw new Error('tsconfig.json opened no project.')
		const { checker, program } = project
		const options = new Set<string>()
		for (const [from, file] of entryPoints()) {
			const source = program.getSourceFile(join(root, file))
			const module = source && checker.getSymbolAtLocation(source)
			if (module === undefined) throw new Error(`${file} has no module.`)
			for (const exported of checker.getExportsOfModule(module)) {
				const symbol =
					exported.flags & SymbolFlags.Alias
						? checker.getAliasedSymbol(exported)
						: exported
				if (!(symbol.flags & SymbolFlags.Value)) continue
				const type = checker.getTypeOfSymbol(symbol)
				if (type === undefined) continue
				for (const signature of checker.getSignaturesOfType(
					type,
					SignatureKind.Call,
				)) {
					for (const parameter of signature.getParameters()) {
						if (parameter.name !== 'options' && parameter.name !== 'definition')
							continue
						const given = checker.getTypeOfSymbol(parameter)
						if (given === undefined) continue
						for (const object of objectsOf(checker, given)) {
							for (const option of checker.getPropertiesOfType(object)) {
								options.add(`${from}: ${exported.name} ${option.name}`)
							}
						}
					}
				}
			}
		}
		return [...options].toSorted()
	} finally {
		api.close()
	}
}

/** The code of every included region, its comments left out. */
function shownCode(): string {
	return (
		pages
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
	)
}

// It imports every package, which `yarn validate`'s parallel runs slow
// past the default five seconds.
it(
	'shows every value a package exports in an included region',
	{ timeout: 30_000 },
	async () => {
		const shown = shownCode()
		const missing = (await valueExports()).filter((entry) => {
			const value = entry.slice(entry.indexOf(': ') + 2)
			return !new RegExp(`\\b${value}\\b`, 'u').test(shown)
		})
		expect(missing).toEqual([])
	},
)

it(
	'shows every option of an exported function, as a key or a method',
	{ timeout: 30_000 },
	() => {
		const shown = shownCode()
		const missing = exportedOptions().filter((entry) => {
			const option = entry.slice(entry.lastIndexOf(' ') + 1)
			return !new RegExp(`\\b${option}\\b(?=\\??\\s*[:(,}])`, 'u').test(shown)
		})
		expect(missing).toEqual([])
	},
)

const docs =
	'https://github.com/MrEkinox/ultimadatabase/blob/main/website/content/docs/'

it('gives each package a README, without code, linking to its page', () => {
	const problems = readdirSync('packages', { withFileTypes: true })
		.filter((entry) => existsSync(join('packages', entry.name, 'package.json')))
		.flatMap((entry) => {
			const path = join('packages', entry.name, 'README.md')
			if (!existsSync(path)) return [`${path}: missing`]
			const text = readFileSync(path, 'utf8')
			const linked = [...text.matchAll(/\]\((?<url>[^)]+)\)/gu)]
				.map((link) => link.groups?.['url'] ?? '')
				.filter((url) => url.startsWith(docs))
			return [
				...(fencesOf(text).length > 0 ? [`${path}: holds code`] : []),
				...(linked.length === 0 ? [`${path}: links to no page`] : []),
				...linked
					.map((url) =>
						join(website, 'content', 'docs', url.slice(docs.length)),
					)
					.filter((page) => !existsSync(page))
					.map((page) => `${path}: ${page} does not exist`),
			]
		})
	expect(problems).toEqual([])
})
