// Every `@ts-expect-error` of the prototype must still fail on its own line,
// with the message recorded in `type-errors.txt`, so a change to a message is
// reviewed in the diff. The prototype is copied with its directives disabled
// and checked by one `tsc` run.
import { spawnSync } from 'node:child_process'
import {
	cpSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'

const root = join(import.meta.dirname, '../..')
const directive = '@ts-expect-error'

type Diagnostic = { readonly at: string; text: string }
type Expected = { readonly at: string; readonly reason: string }

function check(copy: string): Diagnostic[] {
	const result = spawnSync(
		join(root, 'node_modules/.bin/tsc'),
		['-p', 'tsconfig.json', '--pretty', 'false'],
		{ cwd: copy, encoding: 'utf8' },
	)
	const diagnostics: Diagnostic[] = []
	for (const row of result.stdout.split('\n')) {
		const head = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(row)
		const last = diagnostics.at(-1)
		if (head) {
			const [, file, line, code, message] = head
			diagnostics.push({
				at: `${file ?? ''}:${line ?? ''}`,
				text: `${code ?? ''}: ${message ?? ''}`,
			})
		} else if (row.startsWith(' ') && last) {
			last.text += `\n${row}`
		}
	}
	return diagnostics
}

/** Disables every directive in place and lists the lines it covered. */
function disable(copy: string): Expected[] {
	const expected: Expected[] = []
	const files = readdirSync(join(copy, 'prototype'), {
		encoding: 'utf8',
		recursive: true,
	})
		.filter((file) => file.endsWith('.ts'))
		.toSorted()
	for (const file of files) {
		const path = join(copy, 'prototype', file)
		const lines = readFileSync(path, 'utf8').split('\n')
		lines.forEach((text, index) => {
			const at = text.indexOf(directive)
			if (at === -1) return
			const reason = text
				.slice(at + directive.length)
				.replace(/^[\s:-]+/, '')
				.trim()
			expected.push({ at: `prototype/${file}:${index + 2}`, reason })
		})
		writeFileSync(path, lines.join('\n').replaceAll(directive, 'expected'))
	}
	return expected
}

test('every refusal of the prototype fails with its recorded message', async () => {
	const copy = mkdtempSync(join(root, 'node_modules/.type-errors-'))
	try {
		cpSync(join(root, 'bench/typing/prototype'), join(copy, 'prototype'), {
			recursive: true,
		})
		writeFileSync(
			join(copy, 'tsconfig.json'),
			JSON.stringify({
				extends: relative(copy, join(root, 'tsconfig.json')),
				include: ['prototype/**/*.ts'],
				exclude: [],
			}),
		)
		const expected = disable(copy)
		const diagnostics = check(copy)

		const covered = new Set(expected.map(({ at }) => at))
		expect(diagnostics.filter(({ at }) => !covered.has(at))).toEqual([])
		const failing = new Set(diagnostics.map(({ at }) => at))
		expect(expected.filter(({ at }) => !failing.has(at))).toEqual([])

		// Lines move on every edit, so the record keeps the file and the reason.
		const record = expected.map(({ at, reason }) => {
			const messages = diagnostics
				.filter((diagnostic) => diagnostic.at === at)
				.map(({ text }) => text)
			return [`${at.replace(/:\d+$/, '')}: ${reason}`, ...messages].join('\n')
		})
		await expect(`${record.join('\n\n')}\n`).toMatchFileSnapshot(
			'type-errors.txt',
		)
	} finally {
		rmSync(copy, { recursive: true })
	}
})
