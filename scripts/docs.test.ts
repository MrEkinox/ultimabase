// The documentation shows only code that works (D-155): a page of `main`
// writes no code but the commands a developer types, includes the rest from
// a region of an example, and the regions it includes show every value a
// package exports. A frozen version holds its code, not includes.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
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
const requestFile =
	/^examples\/[^/]+\/src\/requests\/[^/]+\.(?:console|graphql|http|json)$/u
const migrationFile = /^examples\/[^/]+\/migrations\/[^/]+\.sql$/u

it('writes no code in a page, and includes only regions that exist', () => {
	const problems = pages.flatMap(([page, text]) => [
		// Shell commands; an `npm` block shows a tab per package manager.
		...fencesOf(text)
			.filter((language) => language !== 'bash' && language !== 'npm')
			.map(
				(language) =>
					`${page}: a \`${language}\` block is written in the page; include it from an example.`,
			),
		// What a command prints is a request file too, which a test runs.
		...[...text.matchAll(/^```bash\n(.*?)^```$/gmsu)]
			.filter(([, block = '']) => /^\$ /mu.test(block))
			.map(
				([, block = '']) =>
					`${page}: a \`bash\` block shows what a command prints; include requests/<name>.console: ${block.slice(0, 40)}`,
			),
		...includesOf(text).flatMap((include) => {
			const [file, content] = read(include.file)
			// The starter's template, a request file and a migration are included
			// whole: they are the developer's, without region markers.
			const whole =
				file.startsWith(starter) ||
				requestFile.test(file) ||
				migrationFile.test(file)
			if (
				!fromWebsite(include) ||
				(whole
					? include.region !== undefined
					: !file.startsWith('examples/') || include.region === undefined)
			) {
				return [
					`${page}: ${include.tag} is not <include cwd>../examples/<file>#<region></include>, a whole file of ${starter}, or a whole request or migration file.`,
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

const examples = 'https://github.com/MrEkinox/ultimabase/tree/main/examples/'

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
					(name !== '' &&
						region(readFileSync(path, 'utf8'), name) === undefined)
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

const docs = 'https://ultimabase.dev/docs'

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
					// `/docs` is the introduction, `/docs/<page>` another page.
					.map((url) =>
						join(
							website,
							'content',
							'docs',
							`${url.slice(docs.length + 1) || 'index'}.mdx`,
						),
					)
					.filter((page) => !existsSync(page))
					.map((page) => `${path}: ${page} does not exist`),
			]
		})
	expect(problems).toEqual([])
})

/**
 * Each fenced block of a Markdown file: its language, its code, and the
 * region or the file the HTML comment above it names, if any.
 */
function blocksOf(markdown: string) {
	const lines = markdown.split('\n')
	const blocks: { language: string; code: string; source: string }[] = []
	let above = ''
	for (let at = 0; at < lines.length; at += 1) {
		const line = lines[at] ?? ''
		const fence = /^(?<marks>`{3,})(?<language>\S*)$/u.exec(line)?.groups
		if (fence === undefined) {
			if (line.trim() !== '') above = line
			continue
		}
		const close = lines.indexOf(fence['marks'] ?? '', at + 1)
		const end = close === -1 ? lines.length : close
		blocks.push({
			language: fence['language'] ?? '',
			code: lines.slice(at + 1, end).join('\n'),
			source:
				/^<!-- (?<source>\S+) -->$/u.exec(above)?.groups?.['source'] ?? '',
		})
		above = ''
		at = end
	}
	return blocks
}

it('reads the blocks of a Markdown file and the source above each', () => {
	const markdown = [
		'```bash',
		'yarn',
		'```',
		'<!-- examples/a/b.ts#c -->',
		'',
		'```ts',
		'const a = 1',
		'```',
		'<!-- examples/a/d.json -->',
		'```json',
		'{}',
		'```',
		'Text.',
		'```ts',
	].join('\n')
	expect(blocksOf(markdown)).toEqual([
		{ language: 'bash', code: 'yarn', source: '' },
		{ language: 'ts', code: 'const a = 1', source: 'examples/a/b.ts#c' },
		{ language: 'json', code: '{}', source: 'examples/a/d.json' },
		{ language: 'ts', code: '', source: '' },
	])
})

it("copies each of the README's code blocks from a region of an example", () => {
	// GitHub includes no file (D-158): the comment above a block names the
	// region or the file it copies, and the copy is checked here.
	const problems = blocksOf(readFileSync('README.md', 'utf8'))
		.filter(({ language }) => language !== 'bash')
		.flatMap(({ code, source }) => {
			const [file = '', name = ''] = source.split('#')
			if (!file.startsWith('examples/') || !existsSync(file)) {
				return [
					`README.md: a block names no region of an example: ${code.split('\n')[0] ?? ''}`,
				]
			}
			const content = readFileSync(file, 'utf8')
			// A block that names no region copies its whole file (D-282).
			return (name === '' ? content.trimEnd() : region(content, name)) === code
				? []
				: [`README.md: the block under ${source} differs from its region`]
		})
	expect(problems).toEqual([])
})

/** The paragraphs of a page: what is neither a heading, a list nor a table. */
function paragraphsOf(page: string): string[] {
	return page
		.replace(/^---\n[\s\S]*?\n---\n/u, '')
		.replaceAll(/^```[\s\S]*?^```$/gmu, '')
		.split(/\n\s*\n/u)
		.map((block) => block.trim())
		.filter((block) => block !== '' && !/^(?:#|\||- |\d+\. |<)/u.test(block))
}

/** What keeps a test's region off a page: its length, or its harness. */
function harnessIn(test: string, shown: string): string[] {
	const lines = shown.trimEnd().split('\n').length
	const declared = [
		...test.matchAll(
			/^(?:async )?function (\w+)|^const (\w+) = (?:async )?\(/gmu,
		),
	]
		.map((match) => match[1] ?? match[2] ?? '')
		.concat(
			[...test.matchAll(/^const \{([^}]+)\} = requestFiles\(/gmu)].flatMap(
				(match) => (match[1] ?? '').split(',').map((name) => name.trim()),
			),
		)
	return [
		...(lines > 12 ? [`${String(lines)} lines, 12 at most`] : []),
		...(shown.includes('fetch(') ? ['it calls fetch'] : []),
		...declared
			.filter((name) => new RegExp(`\\b${name}\\(`, 'u').test(shown))
			.map((name) => `it calls ${name}, which its test file declares`),
	]
}

it('reads what keeps a region of a test off a page', () => {
	const test = 'async function send() {}\nconst at = (a) => a\nconst as = {}\n'
	expect(harnessIn(test, 'Ticket.create({}, as)')).toEqual([])
	expect(harnessIn(test, 'at(await send())\nawait fetch(url)')).toEqual([
		'it calls fetch',
		'it calls send, which its test file declares',
		'it calls at, which its test file declares',
	])
	expect(harnessIn(test, 'a\n'.repeat(13))).toEqual(['13 lines, 12 at most'])
	expect(
		harnessIn(
			'const { file } = requestFiles(here, server)\n',
			"await file('order')",
		),
	).toEqual(['it calls file, which its test file declares'])
})

it('keeps a page easy to scan (D-282)', () => {
	const problems = pages.flatMap(([page, text]) => [
		...paragraphsOf(text)
			.filter((paragraph) => paragraph.split(/\s+/u).length > 60)
			.map(
				(paragraph) =>
					`${page}: a paragraph is over 60 words: ${paragraph.slice(0, 60)}…`,
			),
		...includesOf(text).flatMap((include) => {
			const [file, content = ''] = read(include.file)
			const shown =
				include.region === undefined
					? content
					: (region(content, include.region) ?? '')
			const name = `${file}#${include.region ?? ''}`
			const lines = shown.trimEnd().split('\n').length
			return [
				...(lines > 25
					? [`${page}: ${name} is ${String(lines)} lines, 25 at most.`]
					: []),
				...(file.includes('.test.') && !file.startsWith(starter)
					? harnessIn(content, shown).map(
							(problem) => `${page}: ${name}: ${problem}.`,
						)
					: []),
			]
		}),
	])
	expect(problems).toEqual([])
})

it('sends every request file a page shows, in a test beside it (D-282)', () => {
	const problems = pages.flatMap(([page, text]) =>
		includesOf(text).flatMap((include) => {
			const [file] = read(include.file)
			if (!requestFile.test(file)) return []
			const source = dirname(dirname(file))
			const tests = readdirSync(source)
				.filter((name) => name.includes('.test.'))
				.map((name) => readFileSync(join(source, name), 'utf8'))
				.join('\n')
			const name = basename(file).replace(/\.\w+$/u, '')
			return tests.includes(`'${name}'`)
				? []
				: [`${page}: no test of ${source} sends ${file}.`]
		}),
	)
	expect(problems).toEqual([])
})

it('names the operation of every GraphQL request a page shows (D-282)', () => {
	const problems = pages.flatMap(([page, text]) =>
		includesOf(text).flatMap((include) => {
			const [file, content = ''] = read(include.file)
			return file.endsWith('.graphql') &&
				requestFile.test(file) &&
				!/^(?:query|mutation|subscription)\b/u.test(content)
				? [`${page}: ${file} starts with no operation.`]
				: []
		}),
	)
	expect(problems).toEqual([])
})
