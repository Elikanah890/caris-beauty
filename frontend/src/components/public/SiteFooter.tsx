import Link from 'next/link';
import { MapPin, MessageCircle, Phone } from 'lucide-react';
import { InstallPwaButton } from '@/components/install-pwa-button';

const explore = [
  { label: 'Shop', href: '/shop' },
  { label: 'Categories', href: '/categories' },
  { label: 'About Us', href: '/about' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Help', href: '/help' },
  { label: 'Contact', href: '/contact' },
  { label: 'Staff login', href: '/login' }
];

export function SiteFooter({ variant = 'default' }: { variant?: 'default' | 'home' }) {
  const home = variant === 'home';
  const accent = home ? 'text-blush-700' : 'text-brand-700';
  const muted = home ? 'text-[#6c5559]' : 'text-muted';
  const icon = home ? 'text-blush-600' : 'text-brand-600';
  const hover = home ? 'hover:text-blush-700' : 'hover:text-brand-700';

  return (
    <footer
      className={
        home
          ? 'border-t border-blush-200 bg-blush-100 text-[#2a2022]'
          : 'border-t border-line bg-paper text-ink'
      }
    >
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <img
                src="/images/brand/caris-mark-gold.png"
                alt=""
                className="h-16 w-16 object-contain drop-shadow-[0_3px_6px_rgba(65,35,42,0.35)]"
              />
              <span className="font-display text-lg font-semibold tracking-[0.18em]">
                CARIS
              </span>
            </div>
            <p className={`mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${accent}`}>
              Beauty &amp; Cosmetics
            </p>
            <p className={`mt-1 text-sm ${muted}`}>Mbeya, Tanzania</p>
            <div className="mt-4">
              <InstallPwaButton
                variant={home ? 'home' : 'outline'}
                label="Download app"
              />
            </div>
          </div>

          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${accent}`}>
              Explore
            </p>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {explore.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${muted} transition ${hover}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${accent}`}>
              Visit or call
            </p>
            <a
              href="tel:+255657031253"
              className={`flex items-center gap-2 ${muted} transition ${hover}`}
            >
              <Phone size={15} className={icon} aria-hidden="true" />
              +255 657 031 253
            </a>
            <a
              href="https://wa.me/255657031253"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 ${muted} transition ${hover}`}
            >
              <MessageCircle size={15} className={icon} aria-hidden="true" />
              WhatsApp us
            </a>
            <p className={`flex items-center gap-2 ${muted}`}>
              <MapPin size={15} className={icon} aria-hidden="true" />
              Mbeya, Tanzania
            </p>
          </div>
        </div>

        <div
          className={`mt-8 flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between ${
            home ? 'border-blush-300' : 'border-line'
          } ${muted}`}
        >
          <p>© 2026 CARIS · Beauty &amp; Cosmetics · +255 657 031 253</p>
          <p>Mbeya, Tanzania</p>
        </div>
      </div>
    </footer>
  );
}
