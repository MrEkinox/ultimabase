import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { validate } from './validate.ts'

/** What `validate` printed of the tests. */
function printer(): [string[], (text: string) => void] {
	const printed: string[] = []
	return [printed, (text) => printed.push(text)]
}

it('passes once the checks and the tests pass, the tests printed after', async () => {
	const [printed, print] = printer()
	expect(await validate(['true', 'true'], 'echo tested', print)).toBe(0)
	expect(printed).toStrictEqual(['tested\n'])
})

it('fails with the tests, their output printed', async () => {
	const [printed, print] = printer()
	expect(await validate(['true'], 'echo broken >&2; exit 4', print)).toBe(4)
	expect(printed).toStrictEqual(['broken\n'])
})

it('fails with the first check that fails, the tests stopped', async () => {
	const [printed, print] = printer()
	const directory = mkdtempSync(join(tmpdir(), 'validate-'))
	const [tested, checked] = [
		join(directory, 'tested'),
		join(directory, 'checked'),
	]
	const checks = ['true', 'exit 3', `touch ${checked}`]
	expect(await validate(checks, `sleep 1 && touch ${tested}`, print)).toBe(3)
	expect(printed).toStrictEqual([])
	await new Promise((resolve) => setTimeout(resolve, 1500))
	// The shell's child is stopped with it: nothing runs on after the check.
	expect([existsSync(checked), existsSync(tested)]).toStrictEqual([
		false,
		false,
	])
})
