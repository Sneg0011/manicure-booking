import type { Metadata } from 'next';
import '@fontsource/prata/cyrillic-400.css';
import '@fontsource/prata/latin-400.css';
import '@fontsource/jost/cyrillic-300.css';
import '@fontsource/jost/latin-300.css';
import '@fontsource/jost/cyrillic-400.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/cyrillic-500.css';
import '@fontsource/jost/latin-500.css';
import './globals.css';
import './public.css';

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
