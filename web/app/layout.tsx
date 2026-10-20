import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "../lib/session";
import { SessionBar } from "../lib/session-bar";

export const metadata: Metadata = {
  title: "AP ECET CSE Mock Test (Offline)",
  description: "Offline AP ECET CSE mock-test platform for personal study.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SessionProvider>
          <SessionBar />
          <main id="main">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
