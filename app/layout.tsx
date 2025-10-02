import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "goose.gifts - AI-Powered Funny Gift Finder",
  description: "Discover hilarious, pun-driven gift ideas powered by AI. Perfect for any occasion!",
  keywords: ["funny gifts", "gag gifts", "AI gift finder", "humorous presents", "quirky gifts"],
  openGraph: {
    title: "goose.gifts - AI-Powered Funny Gift Finder",
    description: "Discover hilarious, pun-driven gift ideas powered by AI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <main className="min-h-screen">
          {children}
        </main>

        {/* Affiliate Disclosure Footer */}
        <footer className="border-t border-gray-200 bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-sm text-gray-600 text-center">
              <strong>Affiliate Disclosure:</strong> goose.gifts participates in affiliate programs including Amazon Associates and Awin.
              We earn commissions from qualifying purchases made through our links at no additional cost to you.
            </p>
            <p className="text-xs text-gray-500 text-center mt-4">
              © {new Date().getFullYear()} goose.gifts. All rights reserved.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
