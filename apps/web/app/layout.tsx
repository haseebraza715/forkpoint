import type { Metadata } from "next";
import { Literata, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Literata({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Private Blogging Feedback",
  description: "Private writing with multi-agent reflection.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }]
  },
  openGraph: {
    title: "Private Blogging Intelligence",
    description: "Private writing with multi-agent reflection.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "PBI" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Private Blogging Intelligence",
    description: "Private writing with multi-agent reflection.",
    images: ["/og-image.png"]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} antialiased overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}
