import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { defineConfig } from 'vitest/config'

const testing = ultimabaseTesting()

// PostgreSQL from TEST_DATABASE_URL, or a container started once (ADR-0327).
export default defineConfig({
	test: {
		...testing,
		// The application reads its secrets when it is imported.
		env: {
			...testing.env,
			ACME_PARTNER_TOKEN: 'test-only-partner-token',
			ULTIMABASE_MASTER_KEY: 'test-only-master-key',
		},
	},
})
