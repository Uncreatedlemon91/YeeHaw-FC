import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Nav } from "@/components/nav";
import { CLUB } from "@/config/club";
import { getSessionUser } from "@/lib/auth";
import { env } from "@/lib/env";
import "./globals.css";

const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body" });
const label = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-label" });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${CLUB.siteName} — ${CLUB.tagline}`, template: `%s · ${CLUB.siteName}` },
  description: CLUB.description,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en" className={`${body.variable} ${label.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <Nav user={user} />
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6 text-center font-mono text-micro uppercase tracking-label text-muted-foreground">
          {CLUB.name} · {CLUB.motto} · {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
