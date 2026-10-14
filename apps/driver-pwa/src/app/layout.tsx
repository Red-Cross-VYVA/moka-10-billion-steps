import type { Metadata, Viewport } from "next";
import { InviteRedirect } from "@/features/InviteRedirect";
import { ServiceWorkerRegistration } from "@/features/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "10 Billion Steps · Driver",
  description: "DMC Sites Activation field workflow",
  manifest: "/manifest.webmanifest",
  applicationName: "10 Billion Steps Driver",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "10B Driver",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
