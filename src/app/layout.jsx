import "./globals.css";

export const metadata = {
  title: "Who Stays On? — Generator Load-Shedding Schedule",
  description:
    "Optimization engine and operations dashboard for scheduling generator load-shedding during power outages.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* A plain stylesheet link keeps the build offline-capable — `next/font`
            would need to fetch from Google Fonts while building. Both families
            fall back to system fonts, so the dashboard works without them. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <meta name="theme-color" content="#0b1f3a" />
      </head>
      <body className="antialiased min-h-screen bg-canvas text-ink">{children}</body>
    </html>
  );
}
