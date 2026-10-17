//#region workflow-plugin
import { contributeOperation, plugin } from '@ultimabase/core/plugin'

import { formatGraphqlBinding } from './graphql-binding.ts'
import { formatWorkflow } from './operations.ts'
import { formatRestBinding } from './rest-binding.ts'

/**
 * One owner declares, executes and publishes the operation. Its bindings
 * choose its transports: GraphQL and REST, nothing else (ADR-0341).
 */
export const workflowPlugin = () =>
	plugin({
		id: 'community.workflow',
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeOperation({
				bindings: [formatGraphqlBinding, formatRestBinding],
				execute: ({ input }) => input.trim(),
				operation: formatWorkflow,
				public: { name: 'formatWorkflow' },
			}),
		],
	})
//#endregion workflow-plugin
