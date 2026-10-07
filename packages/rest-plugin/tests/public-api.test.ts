import { expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

it('exports only the deliberate REST schema and route surface', () => {
	expect(Object.keys(publicApi).sort()).toStrictEqual([
		'RestMutationNormalizationError',
		'RestOperationNormalizationError',
		'RestReadNormalizationError',
		'defaultRestMutationLimits',
		'defaultRestReadLimits',
		'executeRestMutationRequest',
		'executeRestReadRequest',
		'normalizeRestMutationRequest',
		'normalizeRestReadRequest',
		'restFieldCodec',
		'restMutationErrorCodes',
		'restOperationErrorCodes',
		'restPlugin',
		'restReadErrorCodes',
		'restResponseErrorCodes',
	])
})
