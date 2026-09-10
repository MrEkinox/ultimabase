import {
	getFieldListDepth,
	getPluginFieldWireCodec,
	type GenericField,
	type PluginFieldWireCodec,
	type SchemaDefinition,
} from '@ultimabase/core'

import { GraphqlSchemaCompilationError } from './errors.js'
import {
	isGraphqlBuiltInFieldKind,
	readGraphqlFieldOwner,
} from './field-metadata.js'
import { graphqlFieldProtocol } from './protocol.js'

export const readGraphqlPluginFieldCodec = (
	field: GenericField,
	schema: SchemaDefinition,
	path: readonly string[],
): PluginFieldWireCodec | undefined => {
	if (isGraphqlBuiltInFieldKind(field.kind)) return undefined
	const codec = getPluginFieldWireCodec(field, graphqlFieldProtocol)
	if (codec === undefined) {
		throw new GraphqlSchemaCompilationError(
			'missing-field-codec',
			`Plugin field ${schema.className}.${path.join('.')} has no ultimabase.graphql.field@1.0.0 JSON codec`,
			{
				owner: readGraphqlFieldOwner(schema, path),
				path: `${schema.className}.${path.join('.')}`,
			},
		)
	}
	return codec
}

export const encodeGraphqlPluginFieldValue = (
	source: unknown,
	name: string,
	field: GenericField,
	codec: PluginFieldWireCodec,
): unknown => {
	if (typeof source !== 'object' || source === null) return undefined
	const value: unknown = Reflect.get(source, name)
	if (value === null || value === undefined) return value
	if (getFieldListDepth(field.options) === 0) return codec.encode(value)
	return Array.isArray(value)
		? value.map((entry) => codec.encode(entry))
		: value
}
