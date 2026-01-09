import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ToastContainer } from "react-toastify";
import { ThemeProvider, ColorSchemeUpdater } from "./components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APPLICATION_TITLE,
  description: process.env.NEXT_PUBLIC_APPLICATION_DESCRIPTION,
  keywords: ["credentials", "blockchain", "security", "identity"],
  authors: [{ name: "Credo Team" }],
  creator: "Credo",
  publisher: "Credo",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    title: "Essi.studio",
    description: "A modern, secure credential management platform",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Essi.studio",
    description: "A modern, secure credential management platform",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#f8fafc" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Credo" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="icon" href={process.env.NEXT_PUBLIC_BWN_LOGO || '/logo.png'} />
      </head>
      <body 
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <ColorSchemeUpdater />
          <AuthProvider>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </AuthProvider>
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
            className="toast-custom"
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
