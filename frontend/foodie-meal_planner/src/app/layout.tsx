import { Metadata } from 'next/dist/lib/metadata/types/metadata-interface';
// @ts-ignore Next.js handles this stylesheet import at build time.
import './globals.css';

// 👇 Update this object
export const metadata: Metadata = {
  metadataBase: new URL('https://mealplanner-amalbasheer.vercel.app'),
  
  // Tab Title
  title: 'Foodie | Autonomous Meal Planner',
  description: 'Your autonomous zero-effort meal planning assistant.',
  
  // Favicon & Touch Icons
  icons: {
    icon: '../favicon.ico',
    shortcut: '../favicon.ico',
    apple: '../logo.png',
  },

  // WhatsApp, LinkedIn, Slack & Facebook Sharing Preview
  openGraph: {
    title: 'Foodie | Autonomous Meal Planner',
    description: 'Your autonomous zero-effort meal planning assistant.',
    url: 'https://mealplanner-amalbasheer.vercel.app',
    siteName: 'Foodie',
    images: [
      {
        url: '../logo.png', // Uses metadataBase above to resolve to full URL
        width: 1200,
        height: 630,
        alt: 'Foodie Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  // Twitter / X Card
  twitter: {
    card: 'summary_large_image',
    title: 'Foodie | Autonomous Meal Planner',
    description: 'Your autonomous zero-effort meal planning assistant.',
    images: ['../logo.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
