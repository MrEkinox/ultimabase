// The programs `yarn typecheck` builds after the root project (D-301, D-323).
// The packages' production code is checked first, and writes its
// declarations; each example is then checked on them, as an application is on
// the packages it installs; the other programs are checked beside the
// examples, in one `tsc --build --force`.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const cache = resolve('node_modules/.cache/typecheck')
const declarations = join(cache, 'declarations')

/** The programs built beside the examples. */
const others = [
	'tsconfig.declarations.json',
	'bench/http',
	'bench/typing',
	'bench/typing/tsconfig.loose.json',
	'website',
]

/** The directories in `parent`, one program or package each. */
export function programs(parent: string): string[] {
	return readdirSync(parent, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map(({ name }) => name)
}

/** Each package import an application writes, and the declaration it reads. */
export function paths(packages: string): Record<string, string[]> {
	const entries: [string, string[]][] = []
	for (const directory of programs(packages)) {
		const manifest: unknown = JSON.parse(
			readFileSync(join(packages, directory, 'package.json'), 'utf8'),
		)
		const name: unknown = Reflect.get(Object(manifest), 'name')
		const exports: unknown = Reflect.get(Object(manifest), 'exports')
		const files = typeof exports === 'object' && exports !== null ? exports : {}
		for (const [path, file] of Object.entries(files)) {
			if (typeof name !== 'string' || typeof file !== 'string') continue
			const declaration = file.replace(/^\.\//, '').replace(/\.ts$/, '.d.ts')
			entries.push([
				join(name, path),
				[join(declarations, directory, declaration)],
			])
		}
	}
	return Object.fromEntries(entries)
}

/** Runs `tsc` with `args`, and answers its exit code. */
function tsc(...args: string[]): number {
	const run = spawnSync('tsc', args, { stdio: 'inherit', shell: false })
	return run.status ?? 1
}

if (import.meta.main) {
	const emitted = tsc(
		'--project',
		'packages/tsconfig.json',
		'--noEmit',
		'false',
		'--emitDeclarationOnly',
		'--outDir',
		declarations,
	)
	if (emitted !== 0) process.exit(emitted)
	mkdirSync(cache, { recursive: true })
	const imports = paths('packages')
	const examples = programs('examples').map((example) => {
		const config = join(cache, `${example}.json`)
		const extended = resolve('examples', example, 'tsconfig.json')
		const program = { extends: extended, compilerOptions: { paths: imports } }
		writeFileSync(config, JSON.stringify(program))
		return config
	})
	process.exit(tsc('--build', '--force', ...others, ...examples))
}
