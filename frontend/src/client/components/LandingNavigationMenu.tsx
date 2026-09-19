'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuPortal,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import Icon, { type IconName } from './Icon'

type NavCard = {
  title: string
  description: string
  href: string
}

const PRODUCT_LINKS: NavCard[] = [
  {
    title: 'How it works',
    description: 'Dual-approval escrow from funding through winner payout.',
    href: '/#how',
  },
  {
    title: 'Docs',
    description: 'Escrow, Razorpay, AWS, agent, and roles — full project guide.',
    href: '/docs',
  },
  {
    title: 'Browse events',
    description: 'Open hackathons accepting registrations right now.',
    href: '/#events',
  },
  {
    title: 'Past events',
    description: 'Completed events with winners and transaction certificates.',
    href: '/past-events',
  },
]

const PORTAL_LINKS: NavCard[] = [
  {
    title: 'Sponsor console',
    description: 'Fund prize pools and co-approve releases.',
    href: '/verifier',
  },
  {
    title: 'Organizer console',
    description: 'Create events, pick winners, propose payouts.',
    href: '/issuer',
  },
  {
    title: 'Escrow wallet',
    description: 'Register for events and track prize status.',
    href: '/holder',
  },
]

function indexFromHash(hash: string): number {
  if (hash === '#roles') return 3
  if (hash === '#how') return 1
  if (hash === '#events') return 0
  return 0
}

function pathIsPastEvents(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/$/, '') === '/past-events'
}

function NavCardLink({ item }: { item: NavCard }) {
  return (
    <NavigationMenuLink href={item.href} closeOnClick className="pv-nav-menu__card">
      <span className="pv-nav-menu__card-title">{item.title}</span>
      <span className="pv-nav-menu__card-desc">{item.description}</span>
    </NavigationMenuLink>
  )
}

function NavGlyph({ icon, label }: { icon: IconName; label: string }) {
  return (
    <>
      <span className="pv-lamp-nav__glyph" aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <span className="pv-lamp-nav__caption">{label}</span>
    </>
  )
}

function itemClass(active: boolean, extra = ''): string {
  return navigationMenuTriggerStyle(
    `pv-lamp-nav__item${active ? ' is-active' : ''}${extra ? ` ${extra}` : ''}`,
  )
}

export default function LandingNavigationMenu({
  renderTools,
}: {
  renderTools?: (ctx: { active: number; setActive: (index: number) => void }) => ReactNode
}) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    setActive(pathIsPastEvents() ? 5 : indexFromHash(window.location.hash))
    const onHash = () => setActive(indexFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="pv-lamp-wrap">
      <div className="pv-lamp-nav">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                href="/#events"
                className={itemClass(active === 0)}
                closeOnClick
                onMouseEnter={() => setActive(0)}
                onFocus={() => setActive(0)}
              >
                <NavGlyph icon="calendar" label="Events" />
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink
                href="/past-events"
                className={itemClass(active === 5)}
                closeOnClick
                onMouseEnter={() => setActive(5)}
                onFocus={() => setActive(5)}
              >
                <NavGlyph icon="trophy" label="Past" />
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem value="product">
              <NavigationMenuTrigger
                className={itemClass(active === 1)}
                onMouseEnter={() => setActive(1)}
                onFocus={() => setActive(1)}
              >
                <NavGlyph icon="shield" label="Product" />
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="pv-nav-menu__stack">
                  {PRODUCT_LINKS.map((item) => (
                    <li key={item.href}>
                      <NavCardLink item={item} />
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem value="portals">
              <NavigationMenuTrigger
                className={itemClass(active === 2)}
                onMouseEnter={() => setActive(2)}
                onFocus={() => setActive(2)}
              >
                <NavGlyph icon="grid" label="Portals" />
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="pv-nav-menu__stack">
                  {PORTAL_LINKS.map((item) => (
                    <li key={item.href}>
                      <NavCardLink item={item} />
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink
                href="/#roles"
                className={itemClass(active === 3)}
                closeOnClick
                onMouseEnter={() => setActive(3)}
                onFocus={() => setActive(3)}
              >
                <NavGlyph icon="users" label="Roles" />
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>

          <NavigationMenuPortal />
        </NavigationMenu>

        {renderTools ? (
          <div className="pv-lamp-nav__tools">{renderTools({ active, setActive })}</div>
        ) : null}
      </div>
    </div>
  )
}

export { itemClass, NavGlyph }
