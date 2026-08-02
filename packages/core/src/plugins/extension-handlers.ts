import {
	type ExtensionDefinition,
	type ExtensionScope,
	type FieldExtension,
	type SchemaDefinition,
} from '../schema/index.js'
import { assertNonEmptyString, isUnknownArray } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type { GenericField } from '../schema/fields/base/contract.js'
import { collectFieldTraversalEntries } from '../schema/fields/traversal.js'
import type {
	ContributionRegistry,
	PluginContribution,
} from './setup-registries.js'

/** Names one schema or field extension handler without merging their scopes. */
export type ExtensionHandlerKey = `${ExtensionScope}:${string}`

/** Creates the shared identity used for handler registration and validation. */
export const extensionHandlerKey = <
	const TScope extends ExtensionScope,
	const TExtensionName extends string,
>(
	scope: TScope,
	extensionName: TExtensionName,
): `${TScope}:${TExtensionName}` => {
	if (scope !== 'schema' && scope !== 'field') {
		throw new TypeError(`Unknown extension scope: ${String(scope)}`)
	}

	assertNonEmptyString(extensionName, 'extensionName')

	return `${scope}:${extensionName}`
}

interface FieldWithExtensions {
	readonly extensions: readonly FieldExtension<string, object>[]
}

const hasFieldExtensions = (options: object): options is FieldWithExtensions =>
	'extensions' in options && isUnknownArray(options.extensions)

const getHandler = (
	handlers: ContributionRegistry,
	extension: ExtensionDefinition<ExtensionScope, string, object>,
): PluginContribution | undefined =>
	handlers.get(extensionHandlerKey(extension.scope, extension.name))

const throwMissingHandler = (
	schemaClassName: string,
	extension: ExtensionDefinition<ExtensionScope, string, object>,
	fieldPath: string | undefined,
	actualPluginName: string | undefined,
): never => {
	const location =
		fieldPath === undefined
			? `Schema "${schemaClassName}"`
			: `Field "${schemaClassName}.${fieldPath}"`

	throw new FrameworkError(
		'PLUGIN_EXTENSION_HANDLER_MISSING',
		`${location} extension "${extension.name}" requires a handler from plugin "${extension.pluginName}".`,
		{
			internalDetails: {
				kind: 'missing-extension-handler',
				scope: extension.scope,
				schemaClassName,
				...(fieldPath === undefined ? {} : { fieldPath }),
				extensionName: extension.name,
				expectedPluginName: extension.pluginName,
				...(actualPluginName === undefined ? {} : { actualPluginName }),
			},
		},
	)
}

const validateExtension = (
	handlers: ContributionRegistry,
	schemaClassName: string,
	extension: ExtensionDefinition<ExtensionScope, string, object>,
	fieldPath?: string,
): void => {
	const handler = getHandler(handlers, extension)

	if (handler?.ownerPlugin !== extension.pluginName) {
		throwMissingHandler(
			schemaClassName,
			extension,
			fieldPath,
			handler?.ownerPlugin,
		)
	}
}

const validateField = (
	handlers: ContributionRegistry,
	schemaClassName: string,
	fieldPath: readonly string[],
	field: GenericField,
): void => {
	const serializedFieldPath = fieldPath.join('.')

	if (hasFieldExtensions(field.options)) {
		for (const extension of field.options.extensions) {
			validateExtension(
				handlers,
				schemaClassName,
				extension,
				serializedFieldPath,
			)
		}
	}
}

/** Ensures every declared extension is claimed by its expected setup owner. */
export const validateExtensionHandlers = (
	schemas: readonly SchemaDefinition[],
	handlers: ContributionRegistry,
): void => {
	for (const schema of schemas) {
		for (const extension of schema.extensions) {
			validateExtension(handlers, schema.className, extension)
		}

		for (const { field, path } of collectFieldTraversalEntries(schema.fields)) {
			validateField(handlers, schema.className, path, field)
		}
	}
}
