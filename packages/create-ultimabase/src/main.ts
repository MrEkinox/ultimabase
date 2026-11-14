// `npm create ultimabase [directory]` (D-130): writes the starter in an empty
// directory, installs nothing, and prints the next commands.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { basename, relative, resolve } from 'node:path'
import type { Manager } from './starter.ts'
import { write } from './starter.ts'

export type Io = {
	readonly cwd: string
	/** `npm_config_user_agent`, which names the package manager that ran it. */
	readonly userAgent: string | undefined
	/** Asks in a terminal, `undefined` once ended; `undefined` elsewhere. */
	readonly ask: ((question: string) => Promise<string | undefined>) | undefined
	readonly print: (text: string) => void
	readonly fail: (text: string) => void
}

const usage = 'Usage: npm create ultimabase [directory]'
const fallback = 'my-app'

/** npm's rule for a new package's name. */
const named = (name: string): boolean =>
	name.length <= 214 && /^[a-z0-9][a-z0-9._-]*$/u.test(name)

/** Names npm refuses for a new package: its own, and Node's modules. */
const taken = (name: string): boolean =>
	name === 'node_modules' || name === 'favicon.ico' || isBuiltin(name)

const managerOf = (userAgent: string | undefined): Manager => {
	const name = userAgent?.split('/')[0]
	return name === 'yarn' || name === 'pnpm' ? name : 'npm'
}
const steps: Record<Manager, readonly string[]> = {
	npm: ['npm install', 'npm run dev'],
	yarn: ['yarn', 'yarn dev'],
	pnpm: ['pnpm install', 'pnpm dev'],
}

/** A question asked on `input` and `output`, a terminal; Ctrl+C or Ctrl+D ends it. */
export const terminal =
	(input: NodeJS.ReadableStream, output: NodeJS.WritableStream) =>
	async (question: string): Promise<string | undefined> => {
		const line = createInterface({ input, output })
		try {
			return await line.question(question)
		} catch {
			// The only rejection: the interface closed, by Ctrl+C or Ctrl+D.
			return undefined
		} finally {
			line.close()
		}
	}

/** The process's directory, package manager, terminal and output. */
export function processIo(): Io {
	const tty = process.stdin.isTTY && process.stdout.isTTY
	return {
		cwd: process.cwd(),
		userAgent: process.env['npm_config_user_agent'],
		ask: tty ? terminal(process.stdin, process.stdout) : undefined,
		print: (text) => {
			console.log(text)
		},
		fail: (text) => {
			console.error(text)
		},
	}
}

async function directoryOf(io: Io): Promise<string | undefined> {
	if (io.ask === undefined) return fallback
	const answer = (await io.ask(`? Project name: (${fallback}) `))?.trim()
	return answer === '' ? fallback : answer
}

/** A path as a POSIX shell reads it back, quoted when it must be. */
const quoted = (path: string): string =>
	/^[\w@%+=:,./-]*$/u.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`

/** `~` and `~/…` as the shell reads them, which `npm create` does not. */
const home = /^~(?=\/|$)/u

const empty = (target: string): boolean =>
	!existsSync(target) ||
	(statSync(target).isDirectory() && readdirSync(target).length === 0)

/** Writes the starter; the process's exit code. */
export async function main(args: readonly string[], io: Io): Promise<number> {
	const [given, ...more] = args
	if (more.length > 0 || given?.startsWith('-') === true) {
		io.fail(usage)
		return 1
	}
	const directory = given ?? (await directoryOf(io))
	if (directory === undefined) {
		io.fail('\nCancelled: nothing was written.')
		return 130
	}
	const target = resolve(io.cwd, directory.replace(home, homedir()))
	const name = basename(target)
	if (!named(name) || taken(name)) {
		io.fail(
			taken(name)
				? `${name} cannot name a package: Node or npm uses it.`
				: `${name} cannot name a package: use lowercase letters, digits, '-', '.' and '_', and start with a letter or a digit.`,
		)
		return 1
	}
	const manager = managerOf(io.userAgent)
	try {
		if (!empty(target)) {
			io.fail(`${directory} is not an empty directory.`)
			return 1
		}
		write(target, name, manager)
	} catch (error) {
		io.fail(
			`Cannot write ${directory}: ${error instanceof Error ? error.message : String(error)}`,
		)
		return 1
	}
	const at = home.test(directory)
		? `~/${quoted(directory.slice(2))}`
		: quoted(directory)
	const cd = relative(io.cwd, target) === '' ? [] : [`cd ${at}`]
	const next = [...cd, ...steps[manager]].map((step) => `  ${step}`)
	io.print(`\nCreated ${name}. Next:\n\n${next.join('\n')}\n`)
	return 0
}
