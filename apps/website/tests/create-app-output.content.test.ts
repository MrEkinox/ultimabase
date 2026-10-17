import { readFileSync } from 'node:fs'
import path from 'node:path'

import { renderBaseFiles, resolveSelection } from '@ultimabase/create-app'
import { describe, expect, it } from 'vitest'

import { websiteRoot } from './code-blocks'

// ADR-0330: Quick Start and Test an Application show files the initializer
// generates. They are compiled snippets (`twoslash`); this check keeps them
// equal to the generator's output, whose own end-to-end tests run them.
const pagePath = (page: string) =>
	path.join(websiteRoot, 'content/docs/1.0.0', `${page}.mdx`)

/** The visible code of the fence titled `title`, indented like the generator. */
const shownFile = (page: string, title: string): string => {
	const lines = readFileSync(pagePath(page), 'utf8').split('\n')
	const start = lines.findIndex(
		(line) => line.startsWith('```') && line.includes(` title="${title}"`),
	)
	const end = lines.indexOf('```', start + 1)
	if (start === -1 || end === -1) throw new Error(`${page} shows no ${title}`)
	const code = lines.slice(start + 1, end)
	// Hidden Twoslash context ends at the cut line.
	const visible = code.slice(code.indexOf('// ---cut---') + 1)
	return `${visible.join('\n')}\n`.replace(/^\t+/gmu, (tabs) =>
		'  '.repeat(tabs.length),
	)
}

// The `--yes` defaults the Quick Start documents.
const generated = renderBaseFiles(
	resolveSelection(
		{
			name: 'notes',
			language: 'ts',
			apis: ['rest'],
			plugins: ['access-plugin'],
			starter: 'task',
			database: 'docker',
		},
		'/tmp',
	),
	// Local secrets appear only in `.env`, which no page shows.
	'DOCKER_PASSWORD',
)

const generatedFile = (name: string): string => {
	const contents = generated.get(name)
	if (contents === undefined) throw new Error(`create-app writes no ${name}`)
	return contents
}

describe('create-app output shown in the documentation', () => {
	it('shows the generated factory and schema on Quick Start', () => {
		expect(shownFile('quick-start', 'src/app.ts')).toBe(
			generatedFile('src/app.ts'),
		)
		expect(shownFile('quick-start', 'src/schemas/task.ts')).toBe(
			generatedFile('src/schemas/task.ts'),
		)
	})

	it('shows the generated scripts on Quick Start', () => {
		const shown: unknown = JSON.parse(
			shownFile('quick-start', 'package.json — TypeScript scripts'),
		)
		const manifest: unknown = JSON.parse(generatedFile('package.json'))
		expect(manifest).toMatchObject({ scripts: shown })
		expect(shown).toStrictEqual(Reflect.get(Object(manifest), 'scripts'))
	})

	it('shows the generated Vitest configuration and first test', () => {
		expect(shownFile('guides/test-an-application', 'vitest.config.ts')).toBe(
			generatedFile('vitest.config.ts'),
		)
		expect(shownFile('guides/test-an-application', 'tests/task.test.ts')).toBe(
			generatedFile('tests/task.test.ts'),
		)
	})
})
