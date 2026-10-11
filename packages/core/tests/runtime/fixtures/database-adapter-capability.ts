import { provideCapability } from '../../../src/plugin.js'
import {
	databaseAdapterCapability,
	type DatabaseAdapter,
} from '../../../src/runtime/database/contracts.js'

/** Creates one application-local adapter provider for Runtime test fixtures. */
export const provideTestDatabaseAdapter = (
	adapter: DatabaseAdapter,
	contributionId = 'database-adapter',
) =>
	provideCapability(databaseAdapterCapability, {
		contributionId,
		create: () => ({ value: adapter }),
	})
