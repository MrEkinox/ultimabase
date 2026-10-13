import path from 'node:path'
import { createTwoslasher } from 'twoslash'
import { describe, expect, it } from 'vitest'

import { twoslashCompilerOptions } from '../lib/twoslash'
import {
	classifyCodeBlocks,
	listDocumentationFiles,
	repositoryRoot,
	websiteRoot,
} from './code-blocks'

// ADR-0330: a fence flagged `twoslash` is compiled by the site build. This
// check compiles the same snippets against the built packages without
// building the site, so a package change that breaks one fails here first.
const snippets = listDocumentationFiles().flatMap((file) =>
	classifyCodeBlocks(file)
		.filter(({ kind }) => kind === 'compiled')
		.map(({ code = [], line }) => ({
			code: code.join('\n'),
			name: `${path.relative(repositoryRoot, file)}:${String(line)}`,
		})),
)

describe('compiled documentation snippets (ADR-0330)', () => {
	it('finds the snippets to compile', () => {
		expect(snippets.length).toBeGreaterThan(0)
	})

	it.each(snippets)(
		'$name compiles with its queries',
		({ code }) => {
			// The site build compiles from the website directory. Without a trailing
			// slash: with one, Twoslash silently reports no excess-property error.
			const twoslash = createTwoslasher({
				compilerOptions: twoslashCompilerOptions,
				vfsRoot: path.resolve(websiteRoot),
			})
			// Twoslash throws on any error the snippet does not declare.
			const result = twoslash(code, 'ts')
			expect(result.errors).toStrictEqual([])
			for (const query of result.queries)
				expect(query.text).not.toMatch(/\bany\b/u)
		},
		60_000,
	)
})
