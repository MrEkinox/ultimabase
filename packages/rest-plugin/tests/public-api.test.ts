import { expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

it('exports only the deliberate REST route-metadata surface', () => {
	expect(Object.keys(publicApi).sort()).toStrictEqual(['restPlugin'])
})
