import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";
import { WalletProvider } from "@/features/wallet/wallet-provider";
import "./globals.css";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "CyberDAO | Governance Dashboard",
  description: "Proposal, membership, and voting console for CyberChain.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
