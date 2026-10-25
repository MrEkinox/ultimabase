// UltimaBase's own Oxlint rules, loaded by `.oxlintrc.json`.
import type { RuleTester } from 'oxlint/plugins-dev'

type Rule = Parameters<RuleTester['run']>[1]

const decision = /\bD-\d+\b/

/**
 * No message names a decision: a decision is the maintainers' record, and
 * only comments and test titles cite one (D-72).
 */
export const noDecisionInString: Rule = {
	meta: {
		messages: {
			named: 'A string names a decision; cite it in a comment instead (D-72).',
		},
	},
	create: (context) => ({
		Literal: (node) => {
			if (typeof node.value === 'string' && decision.test(node.value)) {
				context.report({ node, messageId: 'named' })
			}
		},
		TemplateElement: (node) => {
			if (decision.test(node.value.raw)) {
				context.report({ node, messageId: 'named' })
			}
		},
	}),
}

export default {
	meta: { name: 'ultimabase' },
	rules: { 'no-decision-in-string': noDecisionInString },
}
