import { describe, expect, it } from 'vitest'

import { nextCommands, renderBaseFiles } from './base-template.js'
import { resolveSelection } from './config.js'

describe('base project templates', () => {
	it.each([
		['hooks-plugin', 'hooksPlugin()'],
		['pg-vector-plugin', 'pgVectorPlugin()'],
		['soft-delete-plugin', "softDeletePlugin({ defaultMode: 'disabled' })"],
		['validation-plugin', 'validationPlugin()'],
	] as const)(
		'includes only the selected %s factory in both languages',
		(id, factory) => {
			for (const language of ['ts', 'js'] as const) {
				const plan = resolveSelection(
					{ name: 'notes', language, plugins: [id] },
					'/tmp',
				)
				const files = renderBaseFiles(plan)
				const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
					readonly dependencies: Record<string, string>
				}
				const application = files.get(`src/ultimabase.${language}`) ?? ''
				expect(manifest.dependencies).toHaveProperty(`@ultimabase/${id}`)
				expect(application).toContain(factory)
				expect(plan.plugins).toContain('postgres-plugin')
			}
		},
	)

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

	it('composes data and behavior plugins into a runnable Task graph', () => {
		const plan = resolveSelection(
			{
				name: 'behavior-notes',
				plugins: [
					'hooks-plugin',
					'pg-vector-plugin',
					'soft-delete-plugin',
					'validation-plugin',
				],
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
			readonly dependencies: Record<string, string>
		}
		const application = files.get('src/ultimabase.ts') ?? ''
		const schema = files.get('src/schema.ts') ?? ''
		for (const id of plan.plugins)
			expect(manifest.dependencies).toHaveProperty(`@ultimabase/${id}`)
		expect(manifest.dependencies).toHaveProperty('zod')
		expect(application).toContain('hooksPlugin()')
		expect(application).toContain('pgVectorPlugin()')
		expect(application).toContain(
			"softDeletePlugin({ defaultMode: 'disabled' })",
		)
		expect(application).toContain('validationPlugin()')
		expect(schema).toContain("softDelete: 'replace-delete'")
		expect(schema).toContain('resolveInput:')
		expect(schema).toContain('validation: z.string().min(1).max(200)')
		expect(schema).not.toContain('f.vector(')
		expect(files.get('README.md')).toContain('does not persist vectors')
	})

	it('keeps schema-local options out of an empty JavaScript project', () => {
		const plan = resolveSelection(
			{
				name: 'empty-behavior',
				language: 'js',
				starter: 'empty',
				plugins: ['hooks-plugin', 'soft-delete-plugin', 'validation-plugin'],
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const schema = files.get('src/schema.js') ?? ''
		expect(schema).not.toContain('export const Task')
		expect(files.get('src/ultimabase.js')).toContain('validationPlugin()')
		expect(files.get('package.json')).not.toContain('"zod"')
		expect(files.get('README.md')).toContain(
			'no schema for schema-local behavior',
		)
	})
})
