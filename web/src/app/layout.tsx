import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'https://getbook.ie'),
  title: { default: 'Bookie: your books, with an AI bookkeeper', template: '%s · Bookie' },
  description:
    'Bookie gives you a familiar, Xero-style view of your accounts in Xero or Microsoft Dynamics 365 Business Central, with Bookie the AI bookkeeper on hand to explain them. Open source, by KnowAll AI.',
  applicationName: 'Bookie',
  openGraph: { siteName: 'Bookie', type: 'website', url: 'https://getbook.ie' },
};

export const viewport: Viewport = { themeColor: '#020817', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
