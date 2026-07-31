import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/query public entry point', () => {
	it('exports only implemented runtime values', () => {
		// Type-only AST contracts must not create runtime placeholders.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'QueryCursorError',
			'createQueryAst',
			'createQueryCursorPayload',
			'normalizeLogicalFilter',
			'normalizeQueryCursorOrdering',
			'normalizeQueryCursorPagination',
			'normalizeQueryLimit',
			'normalizeQueryOffsetPagination',
			'normalizeQueryOrdering',
			'normalizeQuerySelection',
			'queryCursorVersion',
			'sealQueryCursor',
			'unsealQueryCursor',
		])
	})
})
