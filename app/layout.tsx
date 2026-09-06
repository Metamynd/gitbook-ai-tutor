import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { tutorConfig } from "@/config/tutor.config";
import { BASE_PATH } from "./lib/base-path";
import "./globals.css";

// Default type system for the template — swap for your own brand fonts
// if you like (branding lives in config/content, not hard-coded here).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: tutorConfig.tutorName,
  description: `An adaptive AI tutor for learning ${tutorConfig.product}.`,
  icons: { icon: `${BASE_PATH}/brand/icon.svg` },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-brand-soft font-sans text-brand-slate antialiased">
        {children}
      </body>
    </html>
  );
}
