import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { siteUrl } from "@/lib/site";

const title = "Chordly | Find Guitar Songs by the Chords You Know";
const description = "Select the guitar chords you know to find songs you can already play. See which songs are one or two chords away, and decide which chord to learn next.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Chordly", title, description, url: "/" },
};

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Chordly",
  url: `${siteUrl}/`,
};

export default function RootPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-2">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website).replace(/</g, "\\u003c") }}
      />
      <div>
        <div className="mb-8 flex items-center gap-3 font-bold text-zinc-100">
          <Image src="/logo-pick.svg" alt="" width={32} height={32} />
          Chordly
        </div>
        <h1 className="text-4xl font-black leading-tight tracking-tight text-zinc-100 sm:text-5xl">
          Find guitar songs you can play with the chords you know
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-zinc-300">
          Know G, C, D, and Em? Pick those chords in Chordly to see what you can play today.
          Discover songs that are one or two chords away and see which chord to learn next.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
        >
          Find songs by chord
        </Link>
        <p className="mt-5 max-w-lg text-sm leading-relaxed text-zinc-400">
          Open a song for chord diagrams, use the microphone tuner, or record a strum to identify a chord.
        </p>
      </div>
      <div className="relative min-h-64 overflow-hidden rounded-3xl border border-zinc-800 sm:min-h-80 lg:min-h-112">
        <Image
          src="/images/guitar-portrait.webp"
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    </main>
  );
}

