import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planet Graph",
  description: "A social graph of planets.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
