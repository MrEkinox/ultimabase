import { expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

it('exports only the deliberate REST read and route surface', () => {
	expect(Object.keys(publicApi).sort()).toStrictEqual([
		'RestReadNormalizationError',
		'defaultRestReadLimits',
		'normalizeRestReadRequest',
		'restFieldCodec',
		'restPlugin',
		'restReadErrorCodes',
	])
})
