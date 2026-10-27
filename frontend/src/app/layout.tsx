import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toast';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: {
    default: 'Caris Beauty and Cosmetics',
    template: '%s · Caris Beauty and Cosmetics'
  },
  description:
    'Genuine skincare, haircare, makeup and perfumes in Mbeya, Tanzania.',
  applicationName: 'Caris Beauty and Cosmetics',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Caris Beauty'
  },
  other: {
    'mobile-web-app-capable': 'yes'
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png'
  }
};

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
