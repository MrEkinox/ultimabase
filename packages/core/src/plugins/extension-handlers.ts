import {
	type ExtensionDefinition,
	type ExtensionScope,
	type FieldExtension,
	type FieldDefinition,
	type SchemaDefinition,
} from '../schema/index.js'
import {
	assertNonEmptyString,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type {
	ContributionRegistry,
	PluginContribution,
} from './setup-registries.js'

type GenericField = FieldDefinition<string, unknown, object>

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

interface ObjectFieldOptions {
	readonly fields: Readonly<Record<string, GenericField>>
}

const hasFieldExtensions = (options: object): options is FieldWithExtensions =>
	'extensions' in options && isUnknownArray(options.extensions)

const hasObjectFields = (
	field: GenericField,
): field is GenericField & {
	readonly kind: 'object'
	readonly options: ObjectFieldOptions
} =>
	field.kind === 'object' &&
	'fields' in field.options &&
	isPlainRecord(field.options.fields)

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
	fieldPath: string,
	field: GenericField,
): void => {
	if (hasFieldExtensions(field.options)) {
		for (const extension of field.options.extensions) {
			validateExtension(handlers, schemaClassName, extension, fieldPath)
		}
	}

	if (!hasObjectFields(field)) {
		return
	}

	for (const [childName, childField] of Object.entries(field.options.fields)) {
		validateField(
			handlers,
			schemaClassName,
			`${fieldPath}.${childName}`,
			childField,
		)
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

		for (const [fieldName, field] of Object.entries(schema.fields)) {
			validateField(handlers, schema.className, fieldName, field)
		}
	}
}
