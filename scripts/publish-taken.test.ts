import { expect, it } from 'vitest'
import { publishTaken } from './publish-taken.ts'

it('takes a version npm has published as taken', () => {
	expect(
		publishTaken(
			'npm error code EPUBLISHCONFLICT\nnpm error You cannot publish over the previously published versions: 0.4.0.',
		),
	).toBe(true)
})

it('takes a version npm has staged as taken', () => {
	// A rerun just after a release, while npm does not serve it yet.
	expect(
		publishTaken(
			'npm error code E409\nnpm error 409 Conflict - PUT https://registry.npmjs.org/@ultimabase%2ftesting - Cannot publish over previously staged version "0.4.0".',
		),
	).toBe(true)
})

it('leaves any other failure to the retries', () => {
	expect(
		publishTaken('npm error code E503\nnpm error 503 Service Unavailable'),
	).toBe(false)
})
