// `ultimabase` and `@ultimabase/testing` are published at one version (D-95).
import { expect, it } from 'vitest'
import kernel from '../../ultimabase/package.json' with { type: 'json' }
import testing from '../package.json' with { type: 'json' }

it('has the version of the kernel it tests', () => {
	expect(testing.version).toBe(kernel.version)
})
