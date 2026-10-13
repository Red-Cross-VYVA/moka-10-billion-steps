import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "10 Billion Steps · Operations",
  description: "Moka Digiteck field activation operations dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
