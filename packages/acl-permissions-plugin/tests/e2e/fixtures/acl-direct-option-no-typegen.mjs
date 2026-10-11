import { stdout } from 'node:process'

import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'

const Application = UltimaBase.use(aclPlugin())
const ProtectedPost = Application.Schema.define({
	className: 'JavaScriptDirectACLPost',
	fields: (field) => ({ title: field.string() }),
})
	.acl()
	.with({ acl: { default: new ACL().grantPublic('read') } })
const application = new Application({
	logger: false,
	schemas: [ProtectedPost],
})
const compiled = application.compile().schemas.get('JavaScriptDirectACLPost')

const MissingPluginPost = UltimaBase.Schema.define({
	className: 'JavaScriptMissingACLPluginPost',
	fields: (field) => ({ title: field.string() }),
	acl: {},
})
let missingPluginCode
try {
	new UltimaBase({
		logger: false,
		schemas: [MissingPluginPost],
	}).compile()
} catch (error) {
	missingPluginCode = error?.code
}

stdout.write(
	`${JSON.stringify({
		fieldKind: compiled.fields.acl.kind,
		missingPluginCode,
		optionPresent: Object.hasOwn(compiled.definition, 'acl'),
		owner: compiled.provenance.fields.acl.owner,
	})}\n`,
)

await application.dispose()
