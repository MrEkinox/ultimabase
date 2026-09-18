import { describe, expect, it } from 'vitest'

import { nextCommands, renderBaseFiles } from './base-template.js'
import { resolveSelection } from './config.js'

describe('base project templates', () => {
	it('puts Typegen in the same TypeScript application graph and before both checks', () => {
		const plan = resolveSelection({ name: 'notes', install: false }, '/tmp')
		const files = renderBaseFiles(plan)
		const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
			readonly dependencies: Record<string, string>
			readonly scripts: Record<string, string>
		}
		expect(files.get('src/ultimabase.ts')).toContain('typegenPlugin()')
		expect(files.get('scripts/generate-types.mjs')).toContain(
			'loadTypegenApplication',
		)
		expect(files.get('tsconfig.json')).toContain('.ultimabase/**/*.d.ts')
		expect(manifest.dependencies).toHaveProperty('@ultimabase/typegen')
		expect(manifest.scripts.typecheck).toMatch(
			/^node --env-file=\.env scripts\/generate-types\.mjs && tsc --noEmit$/,
		)
		expect(manifest.scripts.build).toMatch(
			/^node --env-file=\.env scripts\/generate-types\.mjs && tsc$/,
		)
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining([
				'npm install',
				'npm run typecheck',
				'npm run build',
				'npm start',
			]),
		)
	})

	it('writes JavaScript without Typegen, TypeScript, or generated declarations', () => {
		const plan = resolveSelection(
			{
				name: 'notes',
				language: 'js',
				starter: 'empty',
				packageManager: 'pnpm',
				install: false,
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
			readonly dependencies: Record<string, string>
			readonly devDependencies?: Record<string, string>
			readonly scripts: Record<string, string>
		}
		expect(
			[...files.keys()].filter(
				(name) =>
					name.endsWith('.ts') ||
					name === 'tsconfig.json' ||
					name.startsWith('.ultimabase'),
			),
		).toEqual([])
		expect(manifest.dependencies).not.toHaveProperty('@ultimabase/typegen')
		expect(manifest.devDependencies).toBeUndefined()
		expect(manifest.scripts).toEqual({
			start: 'node --env-file=.env src/main.js',
		})
		expect(files.get('src/main.js')).not.toContain('Task.createOne')
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining(['pnpm install', 'pnpm start']),
		)
	})

	it('keeps Docker credentials private and Compose mapped to loopback', () => {
		const plan = resolveSelection({ name: 'notes', database: 'docker' }, '/tmp')
		const files = renderBaseFiles(plan, 'fixed-test-password')
		expect(files.get('compose.yaml')).toContain('127.0.0.1:54329:5432')
		expect(files.get('compose.yaml')).toContain(
			'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}',
		)
		expect(files.get('.env')).toContain('fixed-test-password')
		expect(files.get('.gitignore')).toContain('.env\n')
		expect(files.get('.env.example')).not.toContain('fixed-test-password')
		expect(() => renderBaseFiles(plan)).toThrow('random Docker password')
	})
})
