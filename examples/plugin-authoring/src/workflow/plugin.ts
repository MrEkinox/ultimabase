//#region workflow-plugin
import { contributeOperation, plugin } from '@ultimabase/core/plugin'

import { formatGraphqlBinding } from './graphql-binding.ts'
import { formatWorkflow } from './operations.ts'

/** One owner declares, executes and publishes the operation. */
export const workflowPlugin = () =>
	plugin({
		id: 'community.workflow',
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeOperation({
				bindings: [formatGraphqlBinding],
				execute: ({ input }) => input.trim(),
				operation: formatWorkflow,
				public: { name: 'formatWorkflow' },
			}),
		],
	})
//#endregion workflow-plugin
