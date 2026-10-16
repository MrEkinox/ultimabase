import { stdout } from 'node:process'

import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'

const Application = UltimaBase.use(aclPlugin())
const ProtectedPost = Application.Schema.define({
	className: 'JavaScriptDirectACLPost',
	fields: (field) => ({ title: field.string() }),
	acl: true,
}).with({ acl: { default: new ACL().grantPublic('read') } })
const application = new Application({
	logger: false,
	schemas: [ProtectedPost],
})
const compiled = application.compile().schemas.get('JavaScriptDirectACLPost')

// `.with` takes only the rules of installed plugins (ADR-0339): without
// aclPlugin(), JavaScript gets a TypeError naming the accepted rules.
let unknownRuleMessage
try {
	const declared = UltimaBase.Schema.define({
		className: 'JavaScriptUnknownRuleACLPost',
		fields: (field) => ({ title: field.string() }),
	})
	Reflect.apply(declared.with, declared, [{ acl: {} }])
} catch (error) {
	unknownRuleMessage = error?.message
}

// A schema declared with ACL, registered where ACL is not installed.
const MissingPluginPost = Application.Schema.define({
	className: 'JavaScriptMissingACLPluginPost',
	fields: (field) => ({ title: field.string() }),
	acl: true,
}).with({ acl: { default: new ACL() } })
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
		unknownRuleMessage,
	})}\n`,
)

await application.dispose()
