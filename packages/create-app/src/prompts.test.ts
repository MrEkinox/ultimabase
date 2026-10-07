import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { parseOptions } from './config.js'
import {
	CancelledError,
	collectSelection,
	pluginChoices,
	type PluginChoice,
	type PromptAdapter,
} from './prompts.js'

const directories: string[] = []
const root = (): string => {
	const directory = mkdtempSync(
		path.join(tmpdir(), 'ultimabase-create-prompt-'),
	)
	directories.push(directory)
	return directory
}

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true })
})

const adapter = (overrides: Partial<PromptAdapter> = {}): PromptAdapter => ({
	name: () => Promise.resolve('notes'),
	directory: () => Promise.resolve('notes'),
	language: () => Promise.resolve('ts'),
	apis: () => Promise.resolve(['rest']),
	plugins: () => Promise.resolve(['hooks-plugin']),
	starter: () => Promise.resolve('task'),
	database: () => Promise.resolve('existing'),
	packageManager: () => Promise.resolve('npm'),
	install: () => Promise.resolve(false),
	confirm: () => Promise.resolve(true),
	print: () => undefined,
	...overrides,
})

describe('selection flow', () => {
	it('makes interactive and equivalent flag choices identical', async () => {
		const directory = root()
		const terminal = await collectSelection(
			parseOptions([]),
			{ cwd: directory, isTTY: true },
			adapter(),
		)
		const flags = await collectSelection(
			parseOptions([
				'--name',
				'notes',
				'--directory',
				'notes',
				'--language',
				'ts',
				'--api',
				'rest',
				'--plugin',
				'@ultimabase/hooks-plugin',
				'--starter',
				'task',
				'--database',
				'existing',
				'--package-manager',
				'npm',
				'--no-install',
			]),
			{ cwd: directory, isTTY: false },
			adapter(),
		)
		expect(terminal).toEqual(flags)
		expect(readdirSync(directory)).toEqual([])
	})

	it('shows API prerequisites as included in the grouped plugin choice', async () => {
		const selected: PluginChoice[][] = []
		await collectSelection(
			parseOptions([]),
			{ cwd: root(), isTTY: true },
			adapter({
				apis: () => Promise.resolve(['rest', 'graphql']),
				plugins: (choices) => {
					selected.push([...choices])
					return Promise.resolve([])
				},
			}),
		)
		const choices = selected[0] ?? []
		expect(choices).toHaveLength(16)
		expect(
			choices.filter((choice) => choice.required).map((choice) => choice.id),
		).toEqual(
			expect.arrayContaining([
				'postgres-plugin',
				'http-plugin',
				'server-hono-plugin',
				'rest-plugin',
				'graphql-plugin',
				'graphql-yoga-plugin',
			]),
		)
		expect(
			pluginChoices([]).find((choice) => choice.id === 'rest-plugin')?.required,
		).toBe(false)
	})

	it('requires explicit non-TTY choices unless --yes supplies documented defaults', async () => {
		const directory = root()
		await expect(
			collectSelection(
				parseOptions(['--name', 'notes']),
				{ cwd: directory, isTTY: false },
				adapter(),
			),
		).rejects.toThrow('Non-interactive mode needs')
		const plan = await collectSelection(
			parseOptions(['--name', 'notes', '--yes']),
			{ cwd: directory, isTTY: false },
			adapter(),
		)
		expect(plan.apis).toEqual([])
		expect(plan.plugins).toEqual(['postgres-plugin'])
		expect(plan.typegen).toBe(true)
		expect(readdirSync(directory)).toEqual([])
	})

	it('cancels before any write or final confirmation', async () => {
		const directory = root()
		await expect(
			collectSelection(
				parseOptions([]),
				{ cwd: directory, isTTY: true },
				adapter({ name: () => Promise.resolve(null) }),
			),
		).rejects.toBeInstanceOf(CancelledError)
		await expect(
			collectSelection(
				parseOptions([]),
				{ cwd: directory, isTTY: true },
				adapter({ confirm: () => Promise.resolve(false) }),
			),
		).rejects.toBeInstanceOf(CancelledError)
		expect(readdirSync(directory)).toEqual([])
	})
})
