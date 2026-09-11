import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signed SDF",
  description:
    "Raymarched signed distance fields with smooth unions, ported to WebGPU with three.js TSL.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
