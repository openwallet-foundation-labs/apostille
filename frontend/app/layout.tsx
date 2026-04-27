import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ToastContainer } from "react-toastify";
import { ThemeProvider, ColorSchemeUpdater } from "./components/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF9" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0D" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APPLICATION_TITLE,
  description: process.env.NEXT_PUBLIC_APPLICATION_DESCRIPTION,
  keywords: ["credentials", "blockchain", "security", "identity"],
  authors: [{ name: `${process.env.NEXT_PUBLIC_COMPANY_NAME} Team` }],
  creator: process.env.NEXT_PUBLIC_COMPANY_NAME,
  publisher: process.env.NEXT_PUBLIC_COMPANY_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    title: process.env.NEXT_PUBLIC_COMPANY_NAME,
    description: "A modern, secure credential management platform",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: process.env.NEXT_PUBLIC_COMPANY_NAME,
    description: "A modern, secure credential management platform",
  },
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
        <meta name="theme-color" content="#FAFAF9" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={process.env.NEXT_PUBLIC_COMPANY_NAME || 'Apostille'} />
        <link rel="apple-touch-icon" href="A" />
        <link rel="icon" href={process.env.NEXT_PUBLIC_BWN_LOGO || 'A'} />
      </head>
      <body 
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen`}
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
