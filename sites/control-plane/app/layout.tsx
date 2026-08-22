import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTube AI Factory V2",
  description: "GitHub-canonical control plane for the YouTube AI Factory V2.",
  openGraph: { title: "YouTube AI Factory V2", description: "A policy-first, human-controlled AI factory built from one canonical source.", type: "website" },
  twitter: { card: "summary", title: "YouTube AI Factory V2", description: "GitHub-canonical control plane for the YouTube AI Factory V2." },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
