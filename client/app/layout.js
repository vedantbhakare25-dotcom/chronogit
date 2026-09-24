import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'ChronoGit — Schema-Driven API Drift Monitor',
  description: 'Git-style contract drift and breaking change monitoring for APIs',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 min-h-screen font-sans antialiased selection:bg-rose-500/20 selection:text-rose-400">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}