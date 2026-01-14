// pages/_document.tsx
import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html lang="ar" dir="rtl">
        <Head>
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#000000" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black" />
          <link
            rel="apple-touch-icon"
            href="/icons/icon-152x152.png"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
          <script>
            {`
              // تسجيل خدمة العملاء
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').then(registration => {
                    console.log('ServiceWorker registered: ', registration.scope);
                  }).catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                  });
                });
              }
            `}
          </script>
        </body>
      </Html>
    );
  }
}

export default MyDocument;
