import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'
import { noDecisionInString } from './lint-plugin.ts'

RuleTester.describe = describe
RuleTester.it = it

new RuleTester().run('no-decision-in-string', noDecisionInString, {
	valid: [
		"// A comment cites a decision (D-72).\nconst message = 'Not started.'",
		"const name = 'ID-12 and D-x'",
		'const pattern = /D-\\d+/',
	],
	invalid: [
		{
			code: "throw new Error('Not started (D-1).')",
			errors: [{ messageId: 'named' }],
		},
		{
			code: 'const message = `Read D-72 for ${name}.`',
			errors: [{ messageId: 'named' }],
		},
	],
})
