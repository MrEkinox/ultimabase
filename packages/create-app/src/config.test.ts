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
			'server-hono-plugin',
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
			'server-hono-plugin',
		])
	})

	it('adds explorer HTTP prerequisites but never Typegen for JavaScript', () => {
		const plan = resolveSelection(
			parseOptions([
				'--name',
				'viewer',
				'--language',
				'js',
				'--plugin',
				'@ultimabase/graphiql-plugin',
			]),
			root(),
		)
		expect(plan.plugins).toContain('graphql-yoga-plugin')
		expect(plan.plugins).toContain('server-hono-plugin')
		expect(plan.typegen).toBe(false)
	})

	it('keeps direct password authentication independent of HTTP', () => {
		const plan = resolveSelection(
			parseOptions([
				'--name',
				'identity-notes',
				'--plugin',
				'@ultimabase/password-auth-plugin',
			]),
			root(),
		)
		expect(plan.plugins).toEqual(['password-auth-plugin', 'postgres-plugin'])
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

	it('detects only an unambiguous invoking manager', () => {
		expect(detectPackageManager('yarn/4.9.2 npm/? node/v24')).toBe('yarn')
		expect(detectPackageManager('unknown/1')).toBeUndefined()
	})
})
