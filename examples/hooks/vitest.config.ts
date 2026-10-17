import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { defineConfig } from 'vitest/config'

// PostgreSQL from TEST_DATABASE_URL, or a container started once.
export default defineConfig({ test: { ...ultimabaseTesting() } })
