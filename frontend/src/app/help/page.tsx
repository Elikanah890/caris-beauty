import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';

export const metadata: Metadata = {
  title: { absolute: 'Help · Caris Beauty and Cosmetics' },
  description:
    'Answers about ordering, payments, authenticity, location and delivery at Caris Beauty and Cosmetics, Mbeya.'
};

const faqs = [
  {
    q: 'How do I place an order?',
    a: 'Browse the shop and tap any product, or message us on WhatsApp at +255 657 031 253. Tell us the product you want and we will confirm the price and availability.'
  },
  {
    q: 'Are your products authentic?',
    a: 'Yes. We stock genuine products from trusted suppliers.'
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept cash, mobile money (M-Pesa, Tigo Pesa, Airtel Money) and bank payment.'
  },
  {
    q: 'Where are you located?',
    a: 'We are in Mbeya, Tanzania. Message us on WhatsApp for the exact shop location and directions.'
  },
  {
    q: 'Do you deliver?',
    a: 'We offer delivery across Mbeya. Message us on WhatsApp with your location and we will confirm the details.'
  },
  {
    q: 'Can I check if an item is in stock?',
    a: 'Yes. Send us the product name on WhatsApp and we will confirm current stock before you order.'
  }
];

export default function HelpPage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-cream py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            Support
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-ink sm:text-5xl">
            Help &amp; FAQ
          </h1>
          <p className="mt-3 text-sm text-muted">
            Quick answers about ordering, payments and visiting our shop.
          </p>

          <div className="mt-8 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-paper shadow-soft">
            {faqs.map((item) => (
              <details key={item.q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-ink">
                  {item.q}
                  <span className="text-brand-700 transition group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-10 rounded-3xl border border-brand-200 bg-brand-50 px-6 py-8 text-ink sm:px-8">
            <h2 className="font-display text-2xl font-semibold">Still need help?</h2>
            <p className="mt-1 text-sm text-muted">
              Chat with us on WhatsApp and we&apos;ll answer as soon as we can.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="https://wa.me/255657031253"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
              >
                Message on WhatsApp
              </a>
              <Link
                href="/contact"
                className="rounded-full border border-line bg-paper px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-cream"
              >
                Contact page
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
