import type { Metadata, Viewport } from "next";
import { InviteRedirect } from "@/features/InviteRedirect";
import "./globals.css";

export const metadata: Metadata = {
  title: "10 Billion Steps · Driver",
  description: "DMC Sites Activation field workflow",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#103f63",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <InviteRedirect />
        {children}
      </body>
    </html>
  );
}
