import { stdout } from 'node:process'

import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'

const Application = UltimaBase.use(aclPlugin())
const ProtectedPost = Application.Schema.define({
	className: 'JavaScriptDirectACLPost',
	fields: (field) => ({ title: field.string() }),
	acl: true,
}).with((plugins) => plugins.acl({ default: new ACL().grantPublic('read') }))
const application = new Application({
	logger: false,
	schemas: [ProtectedPost],
})
const compiled = application.compile().schemas.get('JavaScriptDirectACLPost')

// The object form of `.with` is gone (ADR-0339); JavaScript gets a TypeError.
let objectFormMessage
try {
	UltimaBase.Schema.define({
		className: 'JavaScriptObjectFormACLPost',
		fields: (field) => ({ title: field.string() }),
	}).with({ acl: {} })
} catch (error) {
	objectFormMessage = error?.message
}

// A schema declared with ACL, registered where ACL is not installed.
const MissingPluginPost = Application.Schema.define({
	className: 'JavaScriptMissingACLPluginPost',
	fields: (field) => ({ title: field.string() }),
	acl: true,
}).with((plugins) => plugins.acl({ default: new ACL() }))
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
		objectFormMessage,
		optionPresent: Object.hasOwn(compiled.definition, 'acl'),
		owner: compiled.provenance.fields.acl.owner,
	})}\n`,
)

await application.dispose()
