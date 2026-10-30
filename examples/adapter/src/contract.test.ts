// The contract suite (D-94): every test runs on a new timed memory().
import { testAdapter } from '@ultimabase/testing'
import { memory } from 'ultimabase'
import type { Timed } from './timed.ts'
import { timed } from './timed.ts'

//#region suite
let current: Timed | undefined
testAdapter(
	'timed',
	() => {
		current = timed(memory())
		return current
	},
	{ roundTrips: () => current?.roundTrips() ?? 0 },
)
//#endregion
