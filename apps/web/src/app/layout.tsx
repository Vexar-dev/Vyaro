import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/cairo';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { Providers } from '@/components/Providers';
import { themeInitScript } from '@/components/ui/ThemeProvider';

export const metadata: Metadata = {
  title: { default: 'VAYRO', template: '%s | VAYRO' },
  icons: { icon: '/brand/icon-256.png', apple: '/brand/icon-256.png' },
};
export const viewport: Viewport = { themeColor: '#0e0e0f' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
