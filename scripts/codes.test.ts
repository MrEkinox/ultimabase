// Each plugin declares the codes its errors carry beyond the kernel's
// (D-206), and those its issues carry (D-231): a code a package's production
// code sends is the kernel's, its own declared one, or that of a package it
// builds on, and each code it declares is one it sends. Reads the sources: every all-caps string literal is a
// code, but those listed as not one.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { STATUS_CODES } from 'node:http'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { z } from 'zod'

const packages = 'packages'

// `live` is the client, `testing` checks adapters against the kernel's own
// codes, `create-ultimabase` is the command line: none is a server's plugin.
const outside = new Set(['live', 'testing', 'create-ultimabase'])

/** All-caps literals that name no error's code: environment variables, Node's errors and signals, HTTP methods, SQL, schema names. */
const notCodes = new Set([
	'NODE_ENV',
	'PORT',
	'PGHOST',
	'TEST_DATABASE_URL',
	'ULTIMABASE_CLI_ENV',
	'ULTIMABASE_DEV_REPORT',
	'ULTIMABASE_UNSET_URL',
	'FORCE_COLOR',
	'UV_THREADPOOL_SIZE',
	'ENOENT',
	'EADDRINUSE',
	'ECONNREFUSED',
	'SIGTERM',
	'POST',
	'PATCH',
	'DELETE',
	'HEAD',
	'OPTIONS',
	'NULL',
	// postgres: the command tags a deploy counts (D-344).
	'INSERT',
	'UPDATE',
	'MERGE',
	'NFKC',
	'JSON',
	'REST',
	// files' browser client: an upload that reached no server.
	'NETWORK',
])

// The kernel's query errors, which every transport sends as BAD_USER_INPUT.
const unsent = new Set(['INVALID_QUERY'])

const literal = /'(?<code>[A-Z][A-Z0-9_]{3,})'/gu
const declaration =
	/readonly (?:errors|issues):(?<union>(?:\s*\|?\s*'[A-Z0-9_]+')+)/gu
const kernelUnion =
	/export type ErrorCode =(?<union>(?:\s*\|?\s*'[A-Z0-9_]+')+)/u

/** The literals of a union's text. */
const codesIn = (union: string | undefined): Set<string> =>
	new Set(
		[...(union ?? '').matchAll(literal)].map((m) => m.groups?.['code'] ?? ''),
	)

/** The production files of a package, as text. */
function sourcesOf(name: string): string[] {
	const directory = join(packages, name, 'src')
	if (!existsSync(directory)) return []
	return readdirSync(directory, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
		.filter((file) => !file.split('/').includes('test'))
		.map((file) => readFileSync(join(directory, file), 'utf8'))
}

/** Hono's `HTTPException(status)`, sent as the status's name (D-108). */
const exceptions = /HTTPException\((?<status>\d{3})/gu
const nameOf = (status: string): string =>
	(STATUS_CODES[Number(status)] ?? '')
		.toUpperCase()
		.replaceAll(/[^A-Z0-9]+/gu, '_')

/** What a package declares and sends, from its sources. */
function codesOf(sources: readonly string[]) {
	const declared = new Set<string>()
	const sent = new Set<string>()
	for (const source of sources) {
		let rest = source
		for (const found of source.matchAll(declaration)) {
			for (const code of codesIn(found.groups?.['union'])) declared.add(code)
			rest = rest.replace(found[0], '')
		}
		for (const { groups } of rest.matchAll(literal)) {
			const code = groups?.['code'] ?? ''
			if (!notCodes.has(code)) sent.add(code)
		}
		for (const { groups } of rest.matchAll(exceptions)) {
			sent.add(nameOf(groups?.['status'] ?? ''))
		}
	}
	return { declared, sent }
}

const manifest = z.object({
	dependencies: z.record(z.string(), z.string()).optional(),
	peerDependencies: z.record(z.string(), z.string()).optional(),
})

/** The packages of this repository a package depends on. */
function dependenciesOf(name: string, known: ReadonlySet<string>): string[] {
	const text = readFileSync(join(packages, name, 'package.json'), 'utf8')
	const { dependencies, peerDependencies } = manifest.parse(JSON.parse(text))
	return Object.keys({ ...dependencies, ...peerDependencies })
		.map((each) => each.replace(/^@ultimabase\//u, ''))
		.filter((each) => each !== name && known.has(each))
}

const names = readdirSync(packages, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && !outside.has(entry.name))
	.map((entry) => entry.name)
const kernel = codesIn(
	kernelUnion.exec(
		readFileSync(join(packages, 'ultimabase', 'src', 'errors.ts'), 'utf8'),
	)?.groups?.['union'],
)
const plugins = new Map(names.map((name) => [name, codesOf(sourcesOf(name))]))

it('reads the kernel codes and a declaration', () => {
	expect(kernel).toContain('ACCESS_DENIED')
	expect(kernel).toContain('INTERNAL')
	const { declared, sent } = codesOf([
		"interface Shop { readonly errors: 'CLOSED' | 'SOLD_OUT'; readonly issues: 'SKU_FORMAT' }",
		"throw new PublicError(\n\t'CLOSED',\n\t'Closed.')",
		"process.env['NODE_ENV']; throw new HTTPException(415)",
	])
	expect([...declared]).toEqual(['CLOSED', 'SOLD_OUT', 'SKU_FORMAT'])
	expect([...sent]).toEqual(['CLOSED', 'UNSUPPORTED_MEDIA_TYPE'])
})

it.each(names)(
	'%s sends only the codes it may, and declares only those it sends',
	(name) => {
		const own = plugins.get(name) ?? { declared: new Set(), sent: new Set() }
		const allowed = new Set([
			...kernel,
			...own.declared,
			...dependenciesOf(name, new Set(names)).flatMap((each) => [
				...(plugins.get(each)?.declared ?? []),
			]),
		])
		const undeclared = [...own.sent].filter(
			(code) => !allowed.has(code) && !unsent.has(code),
		)
		expect(
			undeclared,
			'Declare them in its PluginTypes `errors` or `issues`, or list them in notCodes.',
		).toEqual([])
		expect([...own.declared].filter((code) => !own.sent.has(code))).toEqual([])
	},
)
