import type { Metadata } from "next";
import "pdfjs-dist/web/pdf_viewer.css";
import "./globals.css";

export const metadata: Metadata = { title: "Paper Study", description: "A private paper reading workspace" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
