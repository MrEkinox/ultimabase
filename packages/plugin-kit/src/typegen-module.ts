import { defineTypegenReference, type TypegenReference } from '@ultimabase/core'
import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

/** Creates exact public references that all share one package module specifier. */
export interface TypegenModule<TModule extends string> {
	readonly module: TModule
	/**
	 * References one exported public type without repeating its module specifier.
	 * @example `workflowTypes.reference('PublishInput')`
	 */
	reference<const TExportName extends string>(
		exportName: TExportName,
	): TypegenReference<TModule, TExportName>
}

/**
 * Binds a package module for a group of inert Typegen references.
 * Core still validates every export name and reference registration.
 *
 * @example
 * ```ts
 * const workflowTypes = defineTypegenModule('@example/workflow-plugin')
 * const publishInput = workflowTypes.reference('PublishInput')
 * ```
 */
export const defineTypegenModule = <const TModule extends string>(
	module: TModule,
): TypegenModule<TModule> => {
	assertNonEmptyString(module, 'Typegen module')
	const reference = <const TExportName extends string>(
		exportName: TExportName,
	): TypegenReference<TModule, TExportName> =>
		defineTypegenReference({ exportName, module })

	return immutableRecord({ module, reference })
}
