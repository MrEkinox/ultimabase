import type { SymbolDisplayPart } from 'typescript'
import { describe, expect, it } from 'vitest'

import { readMarkedQuickInfo } from '../../../../tooling/vitest/typescript-language-service.js'

/** Joins TypeScript display parts exactly as an editor presents them. */
const readDisplay = (parts: readonly SymbolDisplayPart[] | undefined): string =>
	parts?.map(({ text }) => text).join('') ?? ''

describe('Query IntelliSense', () => {
	it('documents the exact byId parameter without expanding terminal internals', () => {
		const quickInfo = readMarkedQuickInfo(
			`${import.meta.dirname}/query-by-id-hover.fixture.ts`,
			`
import { Schema, stringField } from '../../src/index.js'
import { Query } from '../../src/query/index.js'

const PostSchema = new Schema({ className: 'Post', fields: { title: stringField() } })
const identified = new Query(PostSchema)./* hover */byId('0194f292-0dd9-7c2d-a0a3-a2f755a3d90a')
`,
		)
		const display = readDisplay(quickInfo.displayParts)
		const documentation = readDisplay(quickInfo.documentation)

		expect(display).toContain('byId(id: string): Query<')
		expect(display).not.toContain('OperationObjectId')
		expect(documentation).toContain(
			'Adds an equality filter for the framework-owned object identifier',
		)
		expect(quickInfo.tags?.some(({ name }) => name === 'example')).toBe(true)
	})
})
