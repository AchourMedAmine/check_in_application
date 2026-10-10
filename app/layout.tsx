import type { Metadata, Viewport } from "next";
import { Host_Grotesk } from "next/font/google";
import TopBar from "@/components/TopBar";
import "./globals.css";

// The TRSYP brand face, used for everything — weight and size carry the
// hierarchy, not a second family.
const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TRSYP Check-in",
  description: "Scan participant badges in and out of TRSYP sessions",
};

export const viewport: Viewport = {
  themeColor: "#010008",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hostGrotesk.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <TopBar />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
