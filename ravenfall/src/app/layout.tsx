import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Nav } from "@/components/nav";
import { UNIT } from "@/config/unit";
import { getSessionUser } from "@/lib/auth";
import { env } from "@/lib/env";
import "./globals.css";

const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const heading = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-heading" });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${UNIT.siteName} — ${UNIT.name}`, template: `%s · ${UNIT.siteName}` },
  description: UNIT.description,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en" className={`dark ${body.variable} ${heading.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <Nav user={user} />
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
          {UNIT.org} · {UNIT.name} · {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
