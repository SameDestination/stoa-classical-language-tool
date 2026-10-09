import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://stoa-interlinear-studio.goldnerbaum.chatgpt.site"),
  title: "STOA — Interlinear Reading & Scholarly Typesetting",
  description:
    "Build, edit, and publish interlinear readings in Ancient Greek, Latin, and Classical Chinese.",
  openGraph: {
    title: "STOA — Interlinear Reading & Scholarly Typesetting",
    description:
      "Build, edit, and publish interlinear readings in Ancient Greek, Latin, and Classical Chinese.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "STOA — Read closely. Understand deeply. Typeset beautifully." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "STOA — Interlinear Reading & Scholarly Typesetting",
    description:
      "Build, edit, and publish interlinear readings in Ancient Greek, Latin, and Classical Chinese.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
