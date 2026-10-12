import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { parseOptions } from './config.js'
import {
	CancelledError,
	collectSelection,
	dockerMissingNotice,
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
	databaseUrl: () => Promise.resolve(''),
	packageManager: () => Promise.resolve('npm'),
	install: () => Promise.resolve(false),
	confirm: () => Promise.resolve(true),
	print: () => undefined,
	notice: () => undefined,
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
		expect(choices).toHaveLength(14)
		expect(
			choices.filter((choice) => choice.required).map((choice) => choice.id),
		).toEqual(
			expect.arrayContaining([
				'postgres-plugin',
				'http-plugin',
				'hono-server-plugin',
				'rest-plugin',
				'graphql-plugin',
				'graphql-yoga-plugin',
			]),
		)
		expect(
			pluginChoices([]).find((choice) => choice.id === 'rest-plugin')?.required,
		).toBe(false)
	})

	// Regression: the selector offered pg-vector although it cannot persist vectors.
	it('does not offer the withheld pg-vector plugin', () => {
		expect(
			pluginChoices(['rest', 'graphql']).map((choice) => choice.id),
		).not.toContain('pg-vector-plugin')
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
		// ADR-0327 decision 6: REST and the prototype Access by default.
		const plan = await collectSelection(
			parseOptions(['--name', 'notes', '--yes']),
			{ cwd: directory, dockerAvailable: true, isTTY: false },
			adapter(),
		)
		expect(plan.apis).toEqual(['rest'])
		expect(plan.requestedPlugins).toEqual(['access-plugin'])
		expect(plan.plugins).toEqual(
			expect.arrayContaining(['access-plugin', 'rest-plugin', 'http-plugin']),
		)
		expect(plan.database).toBe('docker')
		expect(plan.language).toBe('ts')
		expect(readdirSync(directory)).toEqual([])
	})

	// ADR-0327 decision 8: without Docker, an existing database, with a notice.
	it('falls back to an existing database when Docker is missing', async () => {
		const notices: string[] = []
		const plan = await collectSelection(
			parseOptions(['--name', 'notes', '--yes']),
			{ cwd: root(), dockerAvailable: false, isTTY: false },
			adapter({
				notice: (message) => {
					notices.push(message)
				},
			}),
		)
		expect(plan.database).toBe('existing')
		expect(notices).toEqual([dockerMissingNotice])
		const offered: boolean[] = []
		const asked = await collectSelection(
			parseOptions([]),
			{ cwd: root(), dockerAvailable: false, isTTY: true },
			adapter({
				database: (dockerAvailable) => {
					offered.push(dockerAvailable)
					return Promise.resolve('existing')
				},
				databaseUrl: () =>
					Promise.resolve('postgres://user:secret@127.0.0.1:5432/notes'),
			}),
		)
		expect(offered).toEqual([false])
		expect(asked.databaseUrl).toBe(
			'postgres://user:secret@127.0.0.1:5432/notes',
		)
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
