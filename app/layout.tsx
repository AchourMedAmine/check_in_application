import type { Metadata } from "next";
import { Orbitron, Host_Grotesk } from "next/font/google";
import SignOutButton from "@/components/SignOutButton";
import "./globals.css";

const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TRSYP Check-in",
  description: "Scan participant QR codes to register session attendance",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${hostGrotesk.variable} ${orbitron.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <header className="admin-header">
          <div className="admin-header-inner">
            <div className="admin-header-left">
              <span className="admin-heading text-lg font-bold">
                TRSYP<span style={{ color: "var(--color-green)" }}> CHECK-IN</span>
              </span>
            </div>
            <div className="admin-header-right">
              <span className="admin-header-name">Staff scanner</span>
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>

        <footer className="px-4 py-6 text-center text-xs text-[var(--viz-ink-faint)]">
          TRSYP {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
