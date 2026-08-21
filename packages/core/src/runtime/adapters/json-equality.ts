import { deepEqual } from 'fast-equals'

import type { JsonValue } from '../../schema/fields/builtins/json.js'

/** Compares validated portable JSON without treating object key order as data. */
export const equalJsonValues = (left: JsonValue, right: JsonValue): boolean =>
	deepEqual(left, right)
