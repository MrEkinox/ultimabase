import { ArrowRight, ArrowUpRight, Blocks, Undo2 } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { Section, TextLink } from '../primitives'

/** Capability labels describe extension surfaces, not fictional executable commands. */
export function ExtensionCapabilities() {
	return (
		<Section
			className="ub-capabilities ub-extension-capabilities"
			id="business-behavior"
			aria-labelledby="extension-capabilities-title"
		>
			<header className="ub-capability-heading">
				<div>
					<p className="ub-section-index">06 / BUSINESS BEHAVIOR</p>
					<h2 id="extension-capabilities-title">Go beyond CRUD.</h2>
				</div>
				<p>
					Use official plugins for common behavior. Build your own for the
					fields, commands, and workflows specific to your application.
				</p>
			</header>
			<div className="ub-extension-grid">
				<article className="ub-soft-delete-panel">
					<Undo2 aria-hidden="true" />
					<p className="ub-demo-eyebrow">SOFT DELETE PLUGIN</p>
					<h3>Delete with a way back.</h3>
					<p>
						Replace native deletes with recoverable tombstones, or add an
						explicit soft-delete command. Ordinary reads and relationship
						traversal hide deleted records.
					</p>
					<figure
						className="ub-delete-lifecycle"
						aria-labelledby="delete-lifecycle-caption"
					>
						<div className="ub-delete-states">
							<span>Visible</span>
							<ArrowRight aria-hidden="true" />
							<span>Hidden</span>
							<ArrowRight aria-hidden="true" />
							<span>Restored</span>
						</div>
						<figcaption id="delete-lifecycle-caption">
							Restore and permanent purge are private server commands requiring
							audited Master authority.
						</figcaption>
					</figure>
					<TextLink
						href={currentDocumentationPath('plugins/official/soft-delete')}
					>
						Explore soft delete <ArrowUpRight aria-hidden="true" />
					</TextLink>
				</article>
				<article className="ub-custom-plugin-panel">
					<Blocks aria-hidden="true" />
					<p className="ub-demo-eyebrow">YOUR OWN PLUGINS</p>
					<h3>Your domain. Your commands.</h3>
					<p>
						Define typed business operations and choose which to expose through
						REST or GraphQL. Extend schema fields, model commands, and query
						builders through the public plugin API.
					</p>
					<dl className="ub-extension-surfaces">
						<div>
							<dt>Declare</dt>
							<dd>Fields · schemas · operations</dd>
						</div>
						<div>
							<dt>Execute</dt>
							<dd>Handlers · Runtime middleware</dd>
						</div>
						<div>
							<dt>Type</dt>
							<dd>Application-specific declarations</dd>
						</div>
					</dl>
					<div className="ub-capability-links">
						<TextLink
							href={currentDocumentationPath(
								'plugins/build-a-plugin/operations-and-graphql',
							)}
						>
							Custom operations <ArrowUpRight aria-hidden="true" />
						</TextLink>
						<TextLink href={currentDocumentationPath('plugins/build-a-plugin')}>
							Build a plugin <ArrowUpRight aria-hidden="true" />
						</TextLink>
					</div>
				</article>
			</div>
			<div className="ub-hooks-strip">
				<div>
					<p className="ub-demo-eyebrow">HOOKS PLUGIN</p>
					<h3>Keep business rules with your data.</h3>
				</div>
				<p>
					Normalize inputs, reject a mutation, and run related database work in
					its transaction. Queue events for delivery after a successful commit.
				</p>
				<TextLink href={currentDocumentationPath('plugins/official/hooks')}>
					Explore Hooks <ArrowUpRight aria-hidden="true" />
				</TextLink>
			</div>
		</Section>
	)
}
