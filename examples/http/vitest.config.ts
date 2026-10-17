import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { defineConfig } from 'vitest/config'

const testing = ultimabaseTesting()

// PostgreSQL from TEST_DATABASE_URL, or a container started once.
export default defineConfig({
	test: {
		...testing,
		// The partner token is read at import, the Master key at start; the
		// tests send both.
		env: {
			...testing.env,
			ACME_PARTNER_TOKEN: 'test-only-partner-token',
			ULTIMABASE_MASTER_KEY: 'test-only-master-key',
		},
	},
})
