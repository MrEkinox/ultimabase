import type {
	FieldBuilderMethodRegistrar,
	PluginSchemaDeclarationRegistrar,
} from '@ultimabase/core'
import { patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'

import {
	aclField,
	aclFieldName,
	aclFieldType,
	aclSchemaOption,
} from './acl-option.js'

interface ACLSchemaDeclarationContext {
	readonly fields: FieldBuilderMethodRegistrar
	readonly schemas: PluginSchemaDeclarationRegistrar
}

/** Declares the direct ACL option, generated field type, and selected patch. */
export const declareACLSchema = ({
	fields,
	schemas,
}: ACLSchemaDeclarationContext): undefined => {
	fields.declareType(aclFieldType)
	schemas.defineOptions({
		contributionId: 'official-acl-option',
		schema: { acl: aclSchemaOption },
	})
	schemas.patch(
		patchSchemas({
			patch: schemaPatch().addField({
				contributionId: 'acl-field',
				field: aclField,
				name: aclFieldName,
			}),
			targets: schemas.select({ option: { name: 'acl' } }),
		}),
	)

	return undefined
}
