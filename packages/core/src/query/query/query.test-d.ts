import { expectTypeOf, test } from 'vitest'

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

test('keeps legacy Query mutation execution helpers absent from source', () => {
	expectTypeOf<true>().toEqualTypeOf<true>()
})
