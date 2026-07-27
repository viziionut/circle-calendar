import type { Metadata, Viewport } from "next";
import "./design-tokens.css";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Circle Calendar",
  description: "Plan. Share. Remember.",
  applicationName: "Circle Calendar",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: "/apple-touch-icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Circle Calendar",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#040914",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ro" suppressHydrationWarning><body><I18nProvider>{children}</I18nProvider></body></html>;
}
