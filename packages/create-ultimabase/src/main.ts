// `npm create ultimabase [directory]` (D-130): writes the starter in an empty
// directory, installs nothing, and prints the next commands.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { basename, relative, resolve } from 'node:path'
import type { Manager } from './starter.ts'
import { write } from './starter.ts'

export type Io = {
	readonly cwd: string
	/** `npm_config_user_agent`, which names the package manager that ran it. */
	readonly userAgent: string | undefined
	/** Asks in a terminal; `undefined` elsewhere. */
	readonly ask: ((question: string) => Promise<string>) | undefined
	readonly print: (text: string) => void
	readonly fail: (text: string) => void
}

const usage = 'Usage: npm create ultimabase [directory]'
const fallback = 'my-app'

/** npm's rule for a new package's name. */
const named = (name: string): boolean =>
	name.length <= 214 && /^[a-z0-9~-][a-z0-9._~-]*$/u.test(name)

const managerOf = (userAgent: string | undefined): Manager => {
	const name = userAgent?.split('/')[0]
	return name === 'yarn' || name === 'pnpm' ? name : 'npm'
}
const steps: Record<Manager, readonly string[]> = {
	npm: ['npm install', 'npm run dev'],
	yarn: ['yarn', 'yarn dev'],
	pnpm: ['pnpm install', 'pnpm dev'],
}

/** A question asked on `input` and `output`, a terminal. */
export const terminal =
	(input: NodeJS.ReadableStream, output: NodeJS.WritableStream) =>
	async (question: string): Promise<string> => {
		const line = createInterface({ input, output })
		try {
			return await line.question(question)
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

async function directoryOf(io: Io): Promise<string> {
	if (io.ask === undefined) return fallback
	const answer = (await io.ask(`? Project name: (${fallback}) `)).trim()
	return answer === '' ? fallback : answer
}

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
	const target = resolve(io.cwd, directory)
	const name = basename(target)
	if (!named(name)) {
		io.fail(
			`${name} cannot name a package: use lowercase letters, digits, '-', '.' and '_'.`,
		)
		return 1
	}
	if (!empty(target)) {
		io.fail(`${directory} is not an empty directory.`)
		return 1
	}
	const manager = managerOf(io.userAgent)
	write(target, name, manager)
	const cd =
		relative(io.cwd, target) === ''
			? []
			: [`cd ${/\s/u.test(directory) ? `"${directory}"` : directory}`]
	const next = [...cd, ...steps[manager]].map((step) => `  ${step}`)
	io.print(`\nCreated ${name}. Next:\n\n${next.join('\n')}\n`)
	return 0
}
