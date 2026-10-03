'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#F4F7FC', color: '#0B1B33' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 900, marginBottom: '8px' }}>حدث خطأ بالنظام</h1>
          <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '400px', marginBottom: '24px' }}>
            نأسف للإزعاج، واجه التطبيق خطأ غير متوقع. يرجى المحاولة مرة أخرى.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              background: '#0066FF',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
