import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const coreRoot = path.join(repositoryRoot, 'packages/core')

const readFiles = (directory: string): readonly string[] =>
	fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name)
		return entry.isDirectory() ? readFiles(entryPath) : [entryPath]
	})

describe('native Hooks and Access removal', () => {
	it('keeps superseded Core product directories absent', () => {
		for (const relativePath of [
			'src/plugins/access-targets.ts',
			'src/plugins/hook-targets.ts',
		]) {
			expect(fs.existsSync(path.join(coreRoot, relativePath))).toBe(false)
		}

		for (const relativePath of [
			'src/runtime/access',
			'src/runtime/hooks',
			'src/schema/access',
			'src/schema/hooks',
		]) {
			const directory = path.join(coreRoot, relativePath)
			expect(
				fs.existsSync(directory) ? readFiles(directory) : [],
			).toStrictEqual([])
		}
	})

	it('keeps removed product contracts out of source and packed Core exports', () => {
		const publicFiles = [
			path.join(coreRoot, 'src/index.ts'),
			path.join(coreRoot, 'src/runtime/index.ts'),
			path.join(coreRoot, 'src/schema/index.ts'),
			// `.` and `./plugin` share one emitted chunk (ADR-0311).
			...fs
				.readdirSync(path.join(coreRoot, 'dist'))
				.filter((name) => name.endsWith('.d.ts') || name.endsWith('.js'))
				.map((name) => path.join(coreRoot, 'dist', name)),
		]
		const removedNames = [
			'FieldAccess',
			'HookContext',
			'HOOK_CONTEXT_CLOSED',
			'HOOK_RECURSION',
			'RuntimeHookBoundaries',
			'SchemaAccess',
		]

		for (const file of publicFiles) {
			const contents = fs.readFileSync(file, 'utf8')
			for (const removedName of removedNames) {
				expect(contents).not.toMatch(new RegExp(`\\b${removedName}\\b`, 'u'))
			}
		}
	})

	it('keeps official plugins on public Core package imports', () => {
		for (const packageName of ['access-plugin', 'hooks-plugin']) {
			const sourceRoot = path.join(
				repositoryRoot,
				'packages',
				packageName,
				'src',
			)
			for (const file of readFiles(sourceRoot).filter((candidate) =>
				candidate.endsWith('.ts'),
			)) {
				// `@ultimabase/core/plugin` is a public entry (ADR-0311).
				expect(fs.readFileSync(file, 'utf8')).not.toMatch(
					/from ['"]@ultimabase\/core\/(?!plugin['"])/u,
				)
			}
		}
	})
})
