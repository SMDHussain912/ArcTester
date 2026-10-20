import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AP ECET CSE Mock Test (Offline)",
  description: "Offline AP ECET CSE mock-test platform for personal study.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 760,
          margin: "0 auto",
          padding: 16,
        }}
      >
        {children}
      </body>
    </html>
  );
}
