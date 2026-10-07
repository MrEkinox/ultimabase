import { expectTypeOf, test } from 'vitest'
import { QueryBuilder, type FindManyInput } from '../../index.js'

// @ts-expect-error -- Core no longer exposes transport cursor contracts.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import protects the removed public API.
import type { QueryCursor } from '../../index.js'

// @ts-expect-error -- Trusted hydration is not part of Core's public authoring surface.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { hydrateQueryFromAst } from '../../index.js'

// @ts-expect-error -- Private object scopes are framework-owned and unforgeable through Core's root.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { scopeQueryToObjectId } from '../../index.js'

// @ts-expect-error -- Operation execution remains behind schema models and relation handles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { executeQueryFindMany } from '../../index.js'

// @ts-expect-error -- The internal execution input carrier must not leak through Core's root.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import type { QueryExecutionInput } from '../../index.js'

// @ts-expect-error -- Itemized schema commands replaced this unreachable helper.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { executeSchemaCreateMany } from './query.js'

// @ts-expect-error -- Itemized schema commands replaced this unreachable helper.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { executeQueryUpdateMany } from './query.js'

// @ts-expect-error -- Itemized schema commands replaced this unreachable helper.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { executeSchemaUpsertMany } from './query.js'

// @ts-expect-error -- Itemized schema commands replaced this unreachable helper.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { executeQueryDeleteMany } from './query.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

test('keeps Query execution and scope internals absent from source exports', () => {
	expectTypeOf<true>().toEqualTypeOf<true>()
})

test('keeps cursor pagination outside the Core Query API', () => {
	const Page = UltimaBase.Schema.define({
		className: 'CursorFreePage',
		fields: (field) => ({ title: field.string() }),
	})
	const query = new QueryBuilder(Page)
	const input = { limit: 20, offset: 40 } satisfies FindManyInput<typeof Page>

	expectTypeOf(input.offset).toEqualTypeOf<number>()
	// @ts-expect-error -- Transport cursors are not a Core QueryBuilder method.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call -- The unresolved call proves the method stays absent.
	query.after('opaque-cursor')
	// @ts-expect-error -- Canonical Core reads expose offset, not cursor pagination.
	const invalidInput: FindManyInput<typeof Page> = { cursor: true }
	void invalidInput
})
