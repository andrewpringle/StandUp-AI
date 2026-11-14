import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "StandUp AI - ACT/SAT Tutor",
  description: "Adaptive, personalized ACT/SAT tutoring for schools (demo)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="cerberus">
      <body className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-6">{children}</main>
      </body>
    </html>
  );
}
