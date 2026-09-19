import type { Metadata } from "next";
import "pdfjs-dist/web/pdf_viewer.css";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

export const metadata: Metadata = { title: "Paper Study", description: "A private paper reading workspace" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><AuthProvider>{children}</AuthProvider></body></html>;
}
