import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, MessageCircle, Phone } from 'lucide-react';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';

export const metadata: Metadata = {
  title: { absolute: 'Contact · Caris Beauty and Cosmetics' },
  description:
    'Contact Caris Beauty and Cosmetics in Mbeya, Tanzania. Call or WhatsApp +255 657 031 253.'
};

export default function ContactPage() {
  return (
    <>
      <SiteHeader />

      <main className="bg-cream">
        <section className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            Get in touch
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Contact us
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
            Have a question about a product or want to place an order? Call or message us
            on WhatsApp and we&apos;ll help you find what you need.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <a
              href="tel:+255657031253"
              className="group rounded-2xl border border-line bg-paper p-6 transition hover:border-brand-300 hover:shadow-soft"
            >
              <Phone size={22} className="text-brand-700" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink">Phone</p>
              <p className="mt-1 text-base text-muted group-hover:text-ink">
                +255 657 031 253
              </p>
            </a>

            <a
              href="https://wa.me/255657031253"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-line bg-paper p-6 transition hover:border-brand-300 hover:shadow-soft"
            >
              <MessageCircle size={22} className="text-brand-700" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink">WhatsApp</p>
              <p className="mt-1 text-base text-muted group-hover:text-ink">
                Chat with us
              </p>
            </a>

            <div className="rounded-2xl border border-line bg-paper p-6">
              <MapPin size={22} className="text-brand-700" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink">Location</p>
              <p className="mt-1 text-base text-muted">Mbeya, Tanzania</p>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href="https://wa.me/255657031253"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <MessageCircle size={16} />
              Order on WhatsApp
            </a>
            <a
              href="tel:+255657031253"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-5 py-3 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-brand-50"
            >
              <Phone size={16} />
              Call us
            </a>
          </div>

          <Link
            href="/"
            className="mt-10 inline-block text-sm font-semibold text-brand-700 hover:underline"
          >
            ← Back to home
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
