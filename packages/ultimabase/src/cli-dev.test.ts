// `ultimabase dev` run by a program (D-356): what its first start reports,
// on a fake watcher.
import { connect } from 'node:net'
import { afterEach, expect, it } from 'vitest'
import { reportStart, unattended } from './cli-dev.ts'
import type { NodeOptions } from './cli-main.ts'

const variable = 'ULTIMABASE_DEV_REPORT'

afterEach(() => {
	delete process.env[variable]
})

/** A watcher whose starts report `codes`, then exits with `exit`. */
const watcher =
	(codes: number[], exit: number) =>
	async (_args: readonly string[], options?: NodeOptions) => {
		process.env[variable] = options?.env[variable]
		for (const code of codes) await reportStart(code)
		return options?.signal.aborted === true ? 143 : exit
	}

it('stops the watcher and returns the code of a first start that fails', async () => {
	expect(await unattended([], watcher([1], 0))).toBe(1)
})

it('leaves the watcher to run after a first start that succeeds, later starts unheard', async () => {
	expect(await unattended([], watcher([0, 1], 0))).toBe(0)
})

/** A process that sends what no start sends, then exits with 3. */
const stranger = async (_args: readonly string[], options?: NodeOptions) => {
	await new Promise<void>((done) => {
		const socket = connect(Number(options?.env[variable]), '127.0.0.1', () => {
			socket.end('hello')
		})
		socket.on('close', () => done())
	})
	return options?.signal.aborted === true ? 143 : 3
}

it('ignores a report that is not an exit code', async () => {
	expect(await unattended([], stranger)).toBe(3)
})

it('reports nothing when no dev waits for it', async () => {
	await expect(reportStart(1)).resolves.toBeUndefined()
})
