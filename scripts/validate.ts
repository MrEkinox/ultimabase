// `yarn validate` (D-321): the tests run beside the other checks, which run
// one after another. The checks print as they go, the tests once they end, so
// that the two never interleave. A check that fails stops the tests.
import { spawn } from 'node:child_process'

/** A command's end: its exit code, and what it printed. */
type Ended = { readonly code: number; readonly output: string }

/** Runs `command` in a shell, its output kept until it ends. */
function kept(command: string) {
	// Its own process group, for a stop to end the shell's children too.
	const child = spawn(command, { shell: true, detached: true })
	const chunks: Buffer[] = []
	child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
	child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
	const ended = new Promise<Ended>((resolve) => {
		child.on('close', (code) =>
			resolve({ code: code ?? 1, output: Buffer.concat(chunks).toString() }),
		)
	})
	const stop = (): void => {
		if (child.pid !== undefined && child.exitCode === null) {
			process.kill(-child.pid, 'SIGTERM')
		}
	}
	return { ended, stop }
}

/** Runs `command` in a shell, its output printed as it comes. */
async function printed(command: string): Promise<number> {
	const child = spawn(command, { shell: true, stdio: 'inherit' })
	return new Promise((resolve) => {
		child.on('close', (code) => resolve(code ?? 1))
	})
}

/**
 * Runs `checks` one after another and `tests` beside them, and answers the
 * exit code: 0 once every command passed.
 */
export async function validate(
	checks: readonly string[],
	tests: string,
	print: (text: string) => void = (text) => process.stdout.write(text),
): Promise<number> {
	const running = kept(tests)
	// An interrupted run ends the tests, which the terminal does not reach.
	const interrupted = (): void => {
		running.stop()
		process.exit(130)
	}
	process.once('SIGINT', interrupted)
	try {
		for (const check of checks) {
			const code = await printed(check)
			if (code !== 0) {
				running.stop()
				await running.ended
				return code
			}
		}
		const { code, output } = await running.ended
		print(output)
		return code
	} finally {
		process.off('SIGINT', interrupted)
	}
}

if (import.meta.main) {
	process.exitCode = await validate(
		['yarn format:check', 'yarn typecheck', 'yarn lint', 'yarn budgets'],
		'yarn test',
	)
}
