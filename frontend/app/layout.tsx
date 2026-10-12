import { Metadata } from 'next/dist/lib/metadata/types/metadata-interface';
// @ts-ignore Next.js handles this stylesheet import at build time.
import './globals.css';

// 👇 Update this object
export const metadata: Metadata = {
  title: 'Foodie | Autonomous Meal Planner',
  description: 'Your autonomous zero-effort meal planning assistant.',
  icons: {
    icon: '../favicon.ico', // or /icon.png
    apple: '../favicon.ico', // For mobile "Add to Home Screen"
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
