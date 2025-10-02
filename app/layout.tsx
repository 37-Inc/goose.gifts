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
        <footer className="border-t border-zinc-200 bg-white py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs text-zinc-500 text-center leading-relaxed">
              We participate in affiliate programs. Purchases through our links support this project at no cost to you.
            </p>
            <p className="text-xs text-zinc-400 text-center mt-6">
              © {new Date().getFullYear()} goose.gifts
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
