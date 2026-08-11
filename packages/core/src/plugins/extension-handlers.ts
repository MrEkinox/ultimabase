import type {
	ExtensionDefinition,
	ExtensionScope,
	FieldExtension,
	SchemaDefinition,
} from '../schema/index.js'
import { isUnknownArray } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type { GenericField } from '../schema/fields/base/contract.js'
import { collectFieldTraversalEntries } from '../schema/fields/traversal.js'
import type { PluginGraph } from './graph.js'

interface FieldWithExtensions {
	readonly extensions: readonly FieldExtension<string, object>[]
}

const hasFieldExtensions = (options: object): options is FieldWithExtensions =>
	'extensions' in options && isUnknownArray(options.extensions)

const throwMissingHandler = (
	schemaClassName: string,
	extension: ExtensionDefinition<ExtensionScope, string, object>,
	fieldPath: string | undefined,
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
			},
		},
	)
}

const validateExtension = (
	installedPluginIds: ReadonlySet<string>,
	schemaClassName: string,
	extension: ExtensionDefinition<ExtensionScope, string, object>,
	fieldPath?: string,
): void => {
	if (!installedPluginIds.has(extension.pluginName)) {
		throwMissingHandler(schemaClassName, extension, fieldPath)
	}
}

const validateField = (
	installedPluginIds: ReadonlySet<string>,
	schemaClassName: string,
	fieldPath: readonly string[],
	field: GenericField,
): void => {
	const serializedFieldPath = fieldPath.join('.')

	if (hasFieldExtensions(field.options)) {
		for (const extension of field.options.extensions) {
			validateExtension(
				installedPluginIds,
				schemaClassName,
				extension,
				serializedFieldPath,
			)
		}
	}
}

/** Ensures every declared extension belongs to one installed plugin identity. */
export const validateExtensionOwners = (
	schemas: readonly SchemaDefinition[],
	graph: PluginGraph,
): void => {
	const installedPluginIds = new Set(
		graph.plugins.map(
			({ definition }) => definition.manifest.identity.pluginId,
		),
	)
	for (const schema of schemas) {
		for (const extension of schema.extensions) {
			validateExtension(installedPluginIds, schema.className, extension)
		}

		for (const { field, path } of collectFieldTraversalEntries(schema.fields)) {
			validateField(installedPluginIds, schema.className, path, field)
		}
	}
}
