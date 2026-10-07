import { expectTypeOf, test } from 'vitest'

import {
	defineDatabaseConstraintCompiler,
	type DatabaseConstraintCompilerContribution,
	type DatabaseConstraintCompilerDefinition,
	type PluginConstraintCompilerRegistry,
	type PluginSetupContext,
} from '../index.js'

test('preserves exact compiler identity through the public setup facade', () => {
	const definition = defineDatabaseConstraintCompiler({
		adapter: 'postgres',
		kind: 'fixture.tenant',
		version: 1,
	})
	expectTypeOf(definition).toEqualTypeOf<
		DatabaseConstraintCompilerDefinition<'postgres', 'fixture.tenant', 1>
	>()
	expectTypeOf<
		PluginSetupContext['constraintCompilers']
	>().toEqualTypeOf<PluginConstraintCompilerRegistry>()
	expectTypeOf<
		ReturnType<PluginConstraintCompilerRegistry['values']>
	>().toEqualTypeOf<readonly DatabaseConstraintCompilerContribution[]>()

	// @ts-expect-error -- Protected definitions reject structural lookalikes.
	const forgedDefinition: DatabaseConstraintCompilerDefinition = {
		adapter: 'postgres',
		kind: 'fixture.tenant',
		version: 1,
	}
	void forgedDefinition

	defineDatabaseConstraintCompiler({
		adapter: 'postgres',
		kind: 'fixture.tenant',
		// @ts-expect-error -- Compiler ownership is always derived from plugin setup.
		ownerPlugin: 'fixture.forged',
		version: 1,
	})
})
