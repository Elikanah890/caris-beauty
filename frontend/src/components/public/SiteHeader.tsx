'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogIn, Menu, MessageCircle, Search, X } from 'lucide-react';
import { InstallPwaButton } from '@/components/install-pwa-button';

const links = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'Categories', href: '/categories' },
  { label: 'About', href: '/about' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Help', href: '/help' }
];

export function SiteHeader({ variant = 'default' }: { variant?: 'default' | 'home' }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const home = variant === 'home';

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header
      className={
        home
          ? 'sticky top-0 z-30 border-b border-blush-200 bg-blush-50/95 text-[#2a2022] backdrop-blur-xl'
          : 'sticky top-0 z-30 border-b border-line bg-cream/90 text-ink backdrop-blur-xl'
      }
    >
      <div
        className={
          home
            ? 'mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-8'
            : 'mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:py-3.5'
        }
      >
        <Link href="/" className="flex items-center gap-3" aria-label="CARIS home">
          <img
            src="/images/brand/caris-mark-gold.png"
            alt=""
            className="h-14 w-14 object-contain drop-shadow-[0_3px_6px_rgba(65,35,42,0.35)] sm:h-[72px] sm:w-[72px]"
          />
          <span className="leading-tight">
            <span className="block font-display text-[22px] font-semibold tracking-[0.16em] text-ink sm:text-2xl">
              CARIS
            </span>
            <span
              className={`block text-[9px] uppercase tracking-[0.26em] sm:text-[10px] ${
                home ? 'text-blush-700' : 'text-brand-700'
              }`}
            >
              Beauty &amp; Cosmetics
            </span>
          </span>
        </Link>

        <nav
          className={
            home
              ? 'hidden items-center gap-7 text-sm lg:flex'
              : 'hidden items-center gap-6 text-sm lg:flex'
          }
          aria-label="Main navigation"
        >
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={
                isActive(link.href)
                  ? `font-semibold ${home ? 'text-blush-700' : 'text-brand-700'}`
                  : `transition ${
                      home
                        ? 'text-[#6c5559] hover:text-blush-700'
                        : 'text-muted hover:text-brand-700'
                    }`
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div
          className={
            home
              ? 'flex items-center justify-end gap-2 sm:gap-3'
              : 'flex items-center'
          }
        >
          {home && (
            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href="/shop"
                aria-label="Search products"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-blush-200 bg-blush-50 text-[#4a3034] transition hover:border-blush-400 hover:text-blush-700"
              >
                <Search className="h-[18px] w-[18px]" />
              </Link>
              <a
                href="https://wa.me/255657031253"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat on WhatsApp"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-blush-200 bg-blush-50 text-[#4a3034] transition hover:border-blush-400 hover:text-blush-700"
              >
                <MessageCircle className="h-[18px] w-[18px]" />
              </a>
              <Link
                href="/shop"
                className="ml-1 rounded-full bg-blush-700 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blush-800"
              >
                Shop Now
              </Link>
            </div>
          )}

          <Link
            href="/login"
            className={`hidden items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition lg:inline-flex ${
              home
                ? 'border border-blush-200 bg-blush-50 text-[#4a3034] hover:border-blush-400 hover:text-blush-700'
                : 'border border-line bg-white text-ink hover:border-brand-300 hover:text-brand-700'
            }`}
          >
            <LogIn size={14} /> Staff login
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={`inline-flex transition lg:hidden ${
              home ? 'text-[#2a2022] hover:text-blush-700' : 'text-ink hover:text-brand-700'
            }`}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <div className="hidden lg:block">
            <InstallPwaButton variant={home ? 'home' : 'outline'} compact />
          </div>
        </div>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className={`border-t px-4 pb-5 pt-2 lg:hidden ${
            home ? 'border-blush-200 bg-blush-50' : 'border-line bg-cream'
          }`}
        >
          <nav className="flex flex-col" aria-label="Mobile navigation">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`border-b py-3 text-sm font-medium last:border-0 ${
                  home ? 'border-blush-200' : 'border-line'
                } ${
                  isActive(link.href)
                    ? `font-semibold ${home ? 'text-blush-700' : 'text-brand-700'}`
                    : home
                      ? 'text-[#6c5559]'
                      : 'text-muted'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <InstallPwaButton
            variant={home ? 'home' : 'outline'}
            className="mt-4 w-full"
          />
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className={`mt-2 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold transition ${
              home
                ? 'border-blush-300 text-blush-700 hover:bg-blush-100'
                : 'border-line text-ink hover:border-brand-300 hover:text-brand-700'
            }`}
          >
            <LogIn size={15} /> Staff login
          </Link>
          {home && (
            <Link
              href="/shop"
              onClick={() => setOpen(false)}
              className="mt-4 flex items-center justify-center rounded-full bg-blush-700 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blush-800"
            >
              Shop Now
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
