import type { Metadata } from 'next';
import '@fontsource/tenor-sans/cyrillic-400.css';
import '@fontsource/tenor-sans/latin-400.css';
import '@fontsource/golos-text/cyrillic-400.css';
import '@fontsource/golos-text/latin-400.css';
import '@fontsource/golos-text/cyrillic-500.css';
import '@fontsource/golos-text/latin-500.css';
import '@fontsource/golos-text/cyrillic-600.css';
import '@fontsource/golos-text/latin-600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Лунка — студия маникюра',
  description: 'Демо онлайн-записи в вымышленную студию маникюра «Лунка».',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
