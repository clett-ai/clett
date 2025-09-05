import Script from "next/script";
export const metadata = { title: "Clett" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script id="outseta-config" strategy="beforeInteractive">
          {`window.Outseta = { tokenStorage: 'cookie', cookieDomain: '.clett.ai' };`}
        </Script>
        <Script src="https://cdn.outseta.com/outseta.min.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
