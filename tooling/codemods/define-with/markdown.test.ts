import { describe, expect, it } from 'vitest'

import { transformMarkdown } from './markdown.ts'

describe('define-with codemod: Markdown', () => {
	it('converts TypeScript and JavaScript blocks, indented ones included', () => {
		const markdown = [
			'# Title',
			'',
			'```ts twoslash title="src/schema.ts"',
			"App.Schema.define({ className: 'A', fields }).acl().with({ acl: rule })",
			'```',
			'',
			'<Tab>',
			'  ```jsx',
			"  App.Schema.define({ className: 'B', fields }).softDelete()",
			'  ```',
			'</Tab>',
			'',
		].join('\n')
		const { text, counts } = transformMarkdown(markdown)
		expect(text).toBe(
			[
				'# Title',
				'',
				'```ts twoslash title="src/schema.ts"',
				"App.Schema.define({ className: 'A', fields, acl: true }).with((plugins) => plugins.acl(rule))",
				'```',
				'',
				'<Tab>',
				'  ```jsx',
				"  App.Schema.define({ className: 'B', fields, softDelete: true })",
				'  ```',
				'</Tab>',
				'',
			].join('\n'),
		)
		expect(counts.shapeMethods).toBe(2)
	})

	it('leaves region-synced blocks and other languages alone', () => {
		const markdown = [
			'<!-- region ../../examples/acl/src/schema.ts#post -->',
			'',
			'```ts',
			"App.Schema.define({ className: 'A', fields }).acl().with({ acl: rule })",
			'```',
			'',
			'<!-- endregion -->',
			'',
			'```text',
			"App.Schema.define({ className: 'A', fields }).acl()",
			'```',
		].join('\n')
		expect(transformMarkdown(markdown).text).toBe(markdown)
	})

	it('reports flags at their document line', () => {
		const { flags } = transformMarkdown(
			['Text', '', '```ts', '', 'Post.with({ access })', '```'].join('\n'),
		)
		expect(flags.map(({ kind, line }) => [kind, line])).toStrictEqual([
			['unrooted-with-object', 5],
		])
	})
})
