import "./globals.css";
import { SessionProvider } from "../lib/session";
import { SessionBar } from "../lib/session-bar";

type Metadata = { title: string; description: string };
type Viewport = { width: string; initialScale: number; themeColor: string };

export const metadata: Metadata = {
  title: "ArcTester — Your study workspace",
  description: "Prepare with mock tests, focused practice and question review.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f8fa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <SessionProvider>
          <SessionBar />
          <main id="main">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
