// `npm create ultimabase` (D-130): the directory it writes in, the name it
// asks for, what it refuses and the next commands it prints.
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Io } from './main.ts'
import { main, processIo, terminal } from './main.ts'
import { ownVersion } from './starter.ts'

let cwd: string
let printed: string[]
let failed: string[]
beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), 'create-ultimabase-'))
	printed = []
	failed = []
})
afterEach(() => {
	rmSync(cwd, { recursive: true, force: true })
	vi.restoreAllMocks()
})

const io = (more: Partial<Io> = {}): Io => ({
	cwd,
	userAgent: undefined,
	ask: undefined,
	print: (text) => printed.push(text),
	fail: (text) => failed.push(text),
	...more,
})
const files = (directory: string): string[] =>
	readdirSync(join(cwd, directory), { recursive: true, encoding: 'utf8' })
		.map((path) => path.replaceAll('\\', '/'))
		.toSorted()
const manifest = (directory: string): unknown =>
	JSON.parse(readFileSync(join(cwd, directory, 'package.json'), 'utf8'))

it('writes the starter in the directory it is given', async () => {
	expect(await main(['blog'], io())).toBe(0)
	expect(files('blog')).toEqual([
		'.gitignore',
		'README.md',
		'package.json',
		'src',
		'src/app.test.ts',
		'src/app.ts',
		'src/models.ts',
		'tsconfig.json',
		'ultimabase.config.ts',
	])
	expect(manifest('blog')).toMatchObject({
		name: 'blog',
		scripts: {
			dev: 'ultimabase dev',
			start: 'ultimabase start',
			test: 'vitest',
		},
		dependencies: {
			ultimabase: `^${ownVersion()}`,
			'@ultimabase/http': `^${ownVersion()}`,
		},
		devDependencies: {
			'@types/node': '^24.19.2',
			'@ultimabase/testing': `^${ownVersion()}`,
		},
	})
	expect(readFileSync(join(cwd, 'blog/README.md'), 'utf8')).toMatch(
		/^# blog\n[\s\S]*`npm run dev`[\s\S]*`npm start`/u,
	)
	expect(printed).toEqual([
		'\nCreated blog. Next:\n\n  cd blog\n  npm install\n  npm run dev\n',
	])
	expect(failed).toEqual([])
})

it.each([
	['yarn/4.9.2 npm/? node/v24.7.0', ['yarn', 'yarn dev']],
	['pnpm/10.0.0 npm/? node/v24.7.0', ['pnpm install', 'pnpm dev']],
	['npm/11.0.0 node/v24.7.0', ['npm install', 'npm run dev']],
	['bun/1.2.0', ['npm install', 'npm run dev']],
])('prints the next commands for %s', async (userAgent, next) => {
	await main(['blog'], io({ userAgent }))
	expect(printed[0]).toBe(
		`\nCreated blog. Next:\n\n${['cd blog', ...next].map((step) => `  ${step}`).join('\n')}\n`,
	)
})

it('asks for the name in a terminal, my-app by default', async () => {
	const questions: string[] = []
	const answering = (answer: string) =>
		io({
			ask: async (question) => {
				questions.push(question)
				return answer
			},
		})
	expect(await main([], answering('  notes '))).toBe(0)
	expect(manifest('notes')).toMatchObject({ name: 'notes' })
	expect(await main([], answering(''))).toBe(0)
	expect(manifest('my-app')).toMatchObject({ name: 'my-app' })
	expect(questions).toEqual([
		'? Project name: (my-app) ',
		'? Project name: (my-app) ',
	])
})

it('takes my-app without a terminal', async () => {
	expect(await main([], io())).toBe(0)
	expect(manifest('my-app')).toMatchObject({ name: 'my-app' })
})

it('writes in the current directory, named after it, when it is empty', async () => {
	const here = join(cwd, 'here')
	mkdirSync(here)
	expect(await main(['.'], io({ cwd: here }))).toBe(0)
	expect(manifest('here')).toMatchObject({ name: 'here' })
	expect(printed[0]).toBe(
		'\nCreated here. Next:\n\n  npm install\n  npm run dev\n',
	)
})

it('quotes a directory with a space in the cd it prints', async () => {
	expect(await main(['my apps/blog'], io())).toBe(0)
	expect(printed[0]).toContain('  cd "my apps/blog"\n')
})

it('refuses a directory that is not empty, or a file', async () => {
	mkdirSync(join(cwd, 'blog'))
	writeFileSync(join(cwd, 'blog/notes.txt'), '')
	writeFileSync(join(cwd, 'file'), '')
	expect(await main(['blog'], io())).toBe(1)
	expect(await main(['file'], io())).toBe(1)
	expect(failed).toEqual([
		'blog is not an empty directory.',
		'file is not an empty directory.',
	])
	expect(files('blog')).toEqual(['notes.txt'])
})

it.each(['Blog', 'my_app!', '.hidden', '_app', 'blog~1', 'a'.repeat(215)])(
	'refuses %s as a package name',
	async (name) => {
		expect(await main([name], io())).toBe(1)
		expect(failed[0]).toBe(
			`${name} cannot name a package: use lowercase letters, digits, '-', '.' and '_', and start with a letter or a digit.`,
		)
	},
)

it('refuses a name answered with a leading dash', async () => {
	expect(await main([], io({ ask: async () => '-blog' }))).toBe(1)
	expect(failed).toEqual([
		`-blog cannot name a package: use lowercase letters, digits, '-', '.' and '_', and start with a letter or a digit.`,
	])
	expect(readdirSync(cwd)).toEqual([])
})

// npm takes these for a new package.
it.each(['blog.v2', 'my_app', '2blog-'])(
	'takes %s as a package name',
	async (name) => {
		expect(await main([name], io())).toBe(0)
		expect(manifest(name)).toMatchObject({ name })
	},
)

it.each([[['blog', 'more']], [['--help']]])(
	'prints its usage for %j',
	async (args) => {
		expect(await main(args, io())).toBe(1)
		expect(failed).toEqual(['Usage: npm create ultimabase [directory]'])
		expect(readdirSync(cwd)).toEqual([])
	},
)

it('asks its question on a terminal', async () => {
	const input = new PassThrough()
	const output = new PassThrough()
	const asked = terminal(input, output)('? Project name: (my-app) ')
	input.write('blog\n')
	expect(await asked).toBe('blog')
	expect(String(output.read())).toBe('? Project name: (my-app) ')
})

it('reads the process', () => {
	vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0')
	const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
	const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
	const own = processIo()
	own.print('out')
	own.fail('err')
	expect(own.cwd).toBe(process.cwd())
	expect(own.userAgent).toBe('pnpm/10.0.0')
	expect(log).toHaveBeenCalledWith('out')
	expect(error).toHaveBeenCalledWith('err')
	vi.unstubAllEnvs()
})
