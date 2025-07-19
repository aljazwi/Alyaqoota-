import Link from 'next/link'

const cardStyle = {
  border: '1px solid #e1e4e8',
  borderRadius: '8px',
  padding: '20px',
  cursor: 'pointer',
  transition: 'transform 0.3s, box-shadow 0.3s',
  marginBottom: '20px'
}

export default function HomePage() {
  return (
    <div>
      <h2>لوحة التحكم الرئيسية</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        <Link href="/shifts">
          <div style={cardStyle}>
            <h3>إدارة الورديات</h3>
            <p>فتح/إغلاق الورديات، تسجيل المبيعات</p>
          </div>
        </Link>

        {/* باقي البطاقات بنفس النمط */}
      </div>
    </div>
  )
}
