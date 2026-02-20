import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "BH Summary Maker",
  description: "BH Summary Maker - Next.js + TypeScript + Tailwind",
  icons: {
    icon: "https://res.cloudinary.com/daye1yfzy/image/upload/v1765211893/ctcqhyxglwe4j13sorwu.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}

