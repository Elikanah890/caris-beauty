import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, MessageCircle, Search, Truck } from 'lucide-react';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';

export const metadata: Metadata = {
  title: { absolute: 'How It Works · Caris Beauty and Cosmetics' },
  description:
    'How to order from Caris Beauty and Cosmetics in Mbeya: browse, message us on WhatsApp, confirm, and collect or arrange delivery.'
};

const steps = [
  {
    icon: Search,
    title: 'Browse the shop',
    body: 'Explore our categories or search for a product by name.'
  },
  {
    icon: MessageCircle,
    title: 'Message us on WhatsApp',
    body: 'Tap a product or the WhatsApp button to start your order.'
  },
  {
    icon: BadgeCheck,
    title: 'Confirm price and availability',
    body: 'We reply with the current price and confirm it is in stock.'
  },
  {
    icon: Truck,
    title: 'Collect or arrange delivery',
    body: 'Pick up in Mbeya or arrange delivery with us on WhatsApp.'
  }
];

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-cream py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            Simple ordering
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-ink sm:text-5xl">
            How it works
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted">
            Ordering from Caris Beauty is quick and personal — no account needed to
            browse and ask.
          </p>

          <ol className="mt-10 grid gap-5 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-3xl border border-line bg-paper p-6 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-700">
                    <step.icon size={20} aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                    Step {index + 1}
                  </span>
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold text-ink">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/shop"
              className="rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Start shopping
            </Link>
            <a
              href="https://wa.me/255657031253"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-line bg-paper px-5 py-3 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-brand-50"
            >
              Message us
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
