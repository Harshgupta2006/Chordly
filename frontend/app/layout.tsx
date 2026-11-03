import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  title: "Chordly: Guitar Song Discovery by Known Chords",
  description: "Select the chords you know to discover songs you can already play, near matches needing 1 or 2 more chords, and which chord to learn next.",
  keywords: ["guitar chords", "song discovery", "guitar tabs", "chord finder", "learn guitar songs"],
  authors: [{ name: "Chordly Team" }],
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="dark scroll-smooth"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-amber-500 selection:text-zinc-950"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
