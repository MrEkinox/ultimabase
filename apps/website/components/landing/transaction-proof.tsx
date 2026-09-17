import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import { ArrowUpRight, Check, Undo2 } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { TextLink } from '../primitives'

/** These are illustrated outcomes, not an in-browser database simulation. */
const outcomes = [
	{
		label: 'Commit',
		steps: [
			'Create an Article',
			'Run a hook-started write',
			'Both writes succeed',
		],
		result: 'One commit. Both changes saved.',
		icon: Check,
	},
	{
		label: 'Rollback',
		steps: [
			'Create an Article',
			'Run a hook-started write',
			'A hook throws before commit',
		],
		result: 'One rollback. Neither change saved.',
		icon: Undo2,
	},
] as const

export function TransactionProof() {
	return (
		<article className="ub-transaction-proof">
			<div>
				<p className="ub-section-index">03 / TRANSACTIONS</p>
				<h2>
					Related writes.
					<br />
					One transaction.
				</h2>
				<p>
					Every mutation runs in a transaction. Nested writes and database work
					started by its hooks share that transaction.
				</p>
				<p>
					A failure before commit rolls back their changes together. Send
					external notifications after commit.
				</p>
				<TextLink
					href={currentDocumentationPath('core/writing-data/transactions')}
				>
					Explore transactions <ArrowUpRight aria-hidden="true" />
				</TextLink>
			</div>
			<figure
				className="ub-transaction-demo"
				aria-labelledby="transaction-caption"
			>
				<figcaption id="transaction-caption">
					One mutation, from write to outcome
				</figcaption>
				<Tabs
					items={outcomes.map((outcome) => outcome.label)}
					className="ub-outcome-tabs"
				>
					<div className="ub-demo-panels">
						{outcomes.map((outcome) => (
							<Tab key={outcome.label} value={outcome.label} forceMount>
								<ol>
									{outcome.steps.map((step, index) => (
										<li key={step}>
											<span aria-hidden="true">0{index + 1}</span>
											{step}
										</li>
									))}
								</ol>
								<p className="ub-transaction-outcome">
									<outcome.icon aria-hidden="true" />
									{outcome.result}
								</p>
							</Tab>
						))}
					</div>
				</Tabs>
			</figure>
		</article>
	)
}
