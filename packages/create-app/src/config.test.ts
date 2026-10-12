import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
	detectPackageManager,
	parseOptions,
	resolveSelection,
} from './config.js'

const directories: string[] = []
const root = (): string => {
	const directory = mkdtempSync(path.join(tmpdir(), 'ultimabase-create-test-'))
	directories.push(directory)
	return directory
}

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true })
})

describe('initializer flags', () => {
	it('normalizes repeatable APIs and official plugins', () => {
		const options = parseOptions([
			'--name',
			'notes',
			'--api',
			'rest',
			'--api',
			'rest',
			'--plugin',
			'@ultimabase/hooks-plugin',
			'--plugin',
			'@ultimabase/hooks-plugin',
			'--no-install',
		])
		const plan = resolveSelection(options, root())
		expect(plan.apis).toEqual(['rest'])
		expect(plan.requestedPlugins).toEqual(['hooks-plugin'])
		expect(plan.plugins).toEqual([
			'hooks-plugin',
			'http-plugin',
			'postgres-plugin',
			'rest-plugin',
			'hono-server-plugin',
		])
		expect(plan.automaticPlugins).toContain('postgres-plugin')
		expect(plan.install).toBe(false)
		expect(Object.isFrozen(plan)).toBe(true)
	})

	it('keeps GraphQL schema-only separate from GraphQL over HTTP', () => {
		const direct = resolveSelection(
			parseOptions([
				'--name',
				'direct',
				'--plugin',
				'@ultimabase/graphql-plugin',
			]),
			root(),
		)
		expect(direct.plugins).toEqual(['graphql-plugin', 'postgres-plugin'])
		const http = resolveSelection(
			parseOptions(['--name', 'graphql-notes', '--api', 'graphql']),
			root(),
		)
		expect(http.plugins).toEqual([
			'graphql-plugin',
			'graphql-yoga-plugin',
			'http-plugin',
			'postgres-plugin',
			'hono-server-plugin',
		])
	})

	it('adds explorer HTTP prerequisites for JavaScript', () => {
		const plan = resolveSelection(
			parseOptions([
				'--name',
				'viewer',
				'--language',
				'js',
				'--plugin',
				'@ultimabase/graphql-explorer-plugin',
			]),
			root(),
		)
		expect(plan.plugins).toContain('graphql-yoga-plugin')
		expect(plan.plugins).toContain('hono-server-plugin')
	})

	// ADR-0327: --yes selects REST and Access, so `none` chooses nothing.
	it('accepts none for APIs and plugins, alone', () => {
		const plan = resolveSelection(
			parseOptions(['--name', 'bare', '--api', 'none', '--plugin', 'none']),
			root(),
		)
		expect(plan.apis).toEqual([])
		expect(plan.plugins).toEqual(['postgres-plugin'])
		expect(() => parseOptions(['--api', 'none', '--api', 'rest'])).toThrow(
			'--api none cannot be combined with other values',
		)
	})

	// ADR-0327 decision 8: an existing database URL goes to .env.
	it('keeps an existing database URL and rejects other values', () => {
		const plan = resolveSelection(
			parseOptions([
				'--name',
				'existing',
				'--database',
				'existing',
				'--database-url',
				'postgres://user:secret@127.0.0.1:5432/notes',
			]),
			root(),
		)
		expect(plan.databaseUrl).toBe('postgres://user:secret@127.0.0.1:5432/notes')
		expect(() =>
			resolveSelection(
				{ name: 'notes', databaseUrl: 'mysql://localhost/notes' },
				root(),
			),
		).toThrow('The database URL must be a postgres:// URL.')
		expect(() =>
			resolveSelection(
				{
					name: 'notes',
					database: 'docker',
					databaseUrl: 'postgres://localhost/notes',
				},
				root(),
			),
		).toThrow('--database-url applies to an existing database only.')
	})

	it('keeps direct authentication independent of HTTP', () => {
		const plan = resolveSelection(
			parseOptions([
				'--name',
				'identity-notes',
				'--plugin',
				'@ultimabase/auth-plugin',
			]),
			root(),
		)
		expect(plan.plugins).toEqual(['auth-plugin', 'postgres-plugin'])
	})

	it('rejects invalid choices and occupied destinations', () => {
		expect(() => parseOptions(['--api', 'xml'])).toThrow('--api must be')
		expect(() =>
			parseOptions(['--plugin', '@ultimabase/missing-plugin']),
		).toThrow('Unknown official plugin')
		expect(() => parseOptions(['--plugin', 'hooks-plugin'])).toThrow(
			'full official package ID',
		)
		expect(() => parseOptions(['--install', '--no-install'])).toThrow(
			'conflicts',
		)
		expect(() => parseOptions(['--database', 'sqlite'])).toThrow(
			'--database must be',
		)
		expect(() => resolveSelection({ name: 'Upper Case' }, root())).toThrow(
			'Invalid npm package name',
		)
		const directory = root()
		expect(() =>
			resolveSelection({ name: 'notes', directory }, directory),
		).toThrow('Destination already exists')
		expect(() =>
			resolveSelection(
				parseOptions([
					'--name',
					'empty-graphql',
					'--starter',
					'empty',
					'--api',
					'graphql',
				]),
				root(),
			),
		).toThrow('GraphQL requires at least one public query field')
	})

	// Regression: create-app offered pg-vector although it cannot persist vectors.
	it('explains why a withheld official plugin is not offered', () => {
		expect(() =>
			parseOptions(['--plugin', '@ultimabase/pg-vector-plugin']),
		).toThrow(
			new Error(
				'@ultimabase/pg-vector-plugin is not offered by create-app yet: it does not persist vector fields',
			),
		)
		// Programmatic JavaScript callers bypass flag parsing.
		const plugins: readonly string[] = ['pg-vector-plugin']
		expect(() =>
			resolveSelection(
				// @ts-expect-error -- the withheld plugin is not a PluginId.
				{ name: 'notes', plugins },
				root(),
			),
		).toThrow('pg-vector-plugin is not offered by create-app yet')
	})

	// Regression: an invalid choice did not say which value was rejected.
	it('echoes the rejected choice', () => {
		expect(() => parseOptions(['--language', 'python'])).toThrow(
			new Error('--language must be one of: ts, js (received "python")'),
		)
	})

	it('detects only an unambiguous invoking manager', () => {
		expect(detectPackageManager('npm/11.0.0 node/v24')).toBe('npm')
		expect(detectPackageManager('yarn/4.9.2 npm/? node/v24')).toBe('yarn')
		expect(detectPackageManager('pnpm/10.0.0 npm/? node/v24')).toBe('pnpm')
		expect(detectPackageManager('unknown/1')).toBeUndefined()
	})
})
