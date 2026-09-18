import { ArrowUpRight, KeyRound, ShieldCheck } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { Section, TextLink } from '../primitives'
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import { accessCapabilities, accessRuleExample } from './capability-content'

/** Identity establishes the caller; the separately installed policies decide access. */
export function IdentityCapabilities() {
	return (
		<Section
			className="ub-capabilities ub-identity-capabilities"
			id="identity-and-access"
			aria-labelledby="identity-capabilities-title"
		>
			<header className="ub-capability-heading">
				<div>
					<p className="ub-section-label">Authentication & access</p>
					<h2 id="identity-capabilities-title">
						Know the caller.
						<br />
						Define their access.
					</h2>
				</div>
				<p>
					Add authentication and authorization as separate plugins. A valid
					session identifies a caller; your policies decide what they can do.
				</p>
			</header>
			<div className="ub-identity-grid">
				<article className="ub-auth-panel">
					<KeyRound aria-hidden="true" />
					<p className="ub-demo-eyebrow">PASSWORD AUTHENTICATION PLUGIN</p>
					<h3>Users and sessions.</h3>
					<p>
						Username-and-password sign-up and login, with Argon2id password
						hashing. Use Bearer tokens or opt into secure HttpOnly cookies.
					</p>
					<ol className="ub-session-lifecycle">
						<li>
							<span>01</span>
							<div>
								<strong>Sign up / log in</strong>
								<p>Create a session for this application.</p>
							</div>
						</li>
						<li>
							<span>02</span>
							<div>
								<strong>Refresh</strong>
								<p>Rotate the token. Invalidate the old one.</p>
							</div>
						</li>
						<li>
							<span>03</span>
							<div>
								<strong>Log out</strong>
								<p>Revoke the current session.</p>
							</div>
						</li>
					</ol>
					<TextLink
						href={currentDocumentationPath(
							'plugins/official/password-authentication',
						)}
					>
						Explore authentication <ArrowUpRight aria-hidden="true" />
					</TextLink>
				</article>
				<article className="ub-access-panel">
					<ShieldCheck aria-hidden="true" />
					<p className="ub-demo-eyebrow">ACCESS / ACL / ROLES PLUGINS</p>
					<h3>Rules at every level.</h3>
					<dl className="ub-access-levels">
						{accessCapabilities.map((item) => (
							<div key={item.title}>
								<dt>{item.title}</dt>
								<dd>{item.detail}</dd>
							</div>
						))}
					</dl>
					<p>
						Define role membership and hierarchies, then use them in your
						policies. When Access and ACL are both installed, their restrictions
						combine.
					</p>
					<div className="ub-capability-links">
						<TextLink
							href={currentDocumentationPath('plugins/official/access')}
						>
							Access rules <ArrowUpRight aria-hidden="true" />
						</TextLink>
						<TextLink
							href={currentDocumentationPath(
								'plugins/official/acl-permissions',
							)}
						>
							Object ACLs <ArrowUpRight aria-hidden="true" />
						</TextLink>
						<TextLink href={currentDocumentationPath('plugins/official/roles')}>
							Roles <ArrowUpRight aria-hidden="true" />
						</TextLink>
					</div>
				</article>
			</div>
			<figure className="ub-policy-proof" aria-labelledby="policy-proof-title">
				<ServerCodeBlock
					code={accessRuleExample}
					lang="ts"
					themes={{ light: 'github-light', dark: 'github-dark' }}
					codeblock={{
						allowCopy: false,
						title: 'article.ts · Access policy excerpt',
						className: 'ub-access-code',
					}}
				/>
				<figcaption>
					<p className="ub-demo-eyebrow">ROW POLICY / ACCESS PLUGIN</p>
					<h3 id="policy-proof-title">Only published articles get through.</h3>
					<p>
						Allow reads, then narrow them with a private filter. Ordinary
						callers can read published articles; drafts stay hidden.
					</p>
					<div className="ub-access-outcomes">
						<span>
							<strong>Published</strong> Readable
						</span>
						<span>
							<strong>Draft</strong> Hidden
						</span>
					</div>
				</figcaption>
			</figure>
		</Section>
	)
}
