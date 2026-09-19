import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";
import Script from "next/script";
import "@frontend/styles/index.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HackPay · Dual-control hackathon prizes in INR",
  description:
    "HackPay locks hackathon prize money in a Razorpay INR vault. Sponsor and organizer both approve before any payout moves.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      style={{ colorScheme: "light" }}
      className={`${outfit.variable} ${jetbrains.variable}`}
    >
      <head>
        <Script id="pv-global-polyfill" strategy="beforeInteractive">{`
          if (typeof global === 'undefined') window.global = window;
          try { localStorage.removeItem('hack_pay_theme'); localStorage.removeItem('twin_lock_theme'); localStorage.removeItem('prize_vault_theme'); } catch (e) {}
        `}</Script>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </head>
      <body>{children}</body>
    </html>
  );
}
