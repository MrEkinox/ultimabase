import { expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

it('exports only the Hono server plugin factory at runtime', () => {
	expect(Object.keys(publicApi)).toStrictEqual(['honoServerPlugin'])
})
