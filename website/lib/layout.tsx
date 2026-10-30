import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

import { Logo } from '../components/logo'

/** What the landing page and the documentation share. */
export const shared: BaseLayoutProps = {
	nav: { title: <Logo /> },
	githubUrl: 'https://github.com/MrEkinox/ultimadatabase',
}
