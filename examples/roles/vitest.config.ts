import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { defineConfig } from 'vitest/config'

const testing = ultimabaseTesting()

// PostgreSQL from TEST_DATABASE_URL, or a container started once.
export default defineConfig({
	test: {
		...testing,
		// The application reads its Master key when it is imported.
		env: { ...testing.env, ULTIMABASE_MASTER_KEY: 'test-only-master-key' },
	},
})
