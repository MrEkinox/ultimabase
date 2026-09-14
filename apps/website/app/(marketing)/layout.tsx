import { HomeLayout } from 'fumadocs-ui/layouts/home'
import type { ReactNode } from 'react'

import { baseLayoutOptions } from '../../lib/layout'

export default function MarketingLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return <HomeLayout {...baseLayoutOptions()}>{children}</HomeLayout>
}
