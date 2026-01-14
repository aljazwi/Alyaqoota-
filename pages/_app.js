import '../styles/globals.css'

export default function MyApp({ Component, pageProps }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header>
        <h1 style={{ margin: 0 }}>نظام إدارة محطة الوقود</h1>
      </header>

      <main style={{ flex: 1, padding: '20px 0' }}>
        <Component {...pageProps} />
      </main>

      <footer style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>
        <p>© {new Date().getFullYear()} جميع الحقوق محفوظة</p>
      </footer>
    </div>
  )
}
