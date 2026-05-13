import nodemailer from 'nodemailer'

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

interface BookingEmailData {
  reference: string
  passenger: string
  origin: string
  destination: string
  departure: Date
  seatLabel: string
  total: number
  busName: string
}

export async function sendBookingConfirmationEmail(to: string, data: BookingEmailData) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[Email] SMTP not configured — skipping. Would send to:', to, data.reference)
    return
  }

  const departure = new Date(data.departure)
  const dateStr = departure.toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const timeStr = departure.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'Cairo', Arial, sans-serif; background: #09090b; color: #fafafa; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; color: #fff; }
    .header p { margin: 8px 0 0; color: rgba(255,255,255,0.7); font-size: 14px; }
    .body { padding: 32px; }
    .ref { text-align: center; background: #09090b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .ref code { font-size: 24px; font-weight: bold; color: #3b82f6; letter-spacing: 2px; }
    .ref label { display: block; font-size: 12px; color: #71717a; margin-top: 4px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .info-card { background: #09090b; border: 1px solid #27272a; border-radius: 12px; padding: 16px; }
    .info-card label { font-size: 11px; color: #71717a; display: block; margin-bottom: 4px; }
    .info-card p { margin: 0; font-size: 16px; font-weight: 600; color: #fff; }
    .info-card .highlight { color: #3b82f6; font-size: 20px; }
    .seat-box { text-align: center; background: linear-gradient(135deg, #3b82f6/10, #2563eb/5); border: 1px solid #3b82f6/20; border-radius: 12px; padding: 20px; }
    .seat-box p { margin: 0; font-size: 36px; font-weight: 900; color: #3b82f6; }
    .seat-box label { font-size: 11px; color: #71717a; }
    .footer { text-align: center; padding: 24px; border-top: 1px solid #27272a; color: #71717a; font-size: 12px; }
    .route { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 700; margin-bottom: 24px; justify-content: center; }
    .route-dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ تم تأكيد حجزك</h1>
      <p>CrushCar — حجز مقعدك جاهز</p>
    </div>
    <div class="body">
      <div class="ref">
        <label>رقم الحجز</label>
        <code>${data.reference}</code>
      </div>
      <div class="route">
        <span>${data.origin}</span>
        <span>🚌</span>
        <span>${data.destination}</span>
      </div>
      <div class="info-grid">
        <div class="info-card">
          <label>التاريخ</label>
          <p>${dateStr}</p>
        </div>
        <div class="info-card">
          <label>الوقت</label>
          <p>${timeStr}</p>
        </div>
        <div class="info-card">
          <label>الباص</label>
          <p>${data.busName}</p>
        </div>
        <div class="info-card">
          <label>المبلغ المدفوع</label>
          <p class="highlight">${data.total.toFixed(0)} ج.م</p>
        </div>
      </div>
      <div class="seat-box">
        <label>مقعدك</label>
        <p>${data.seatLabel}</p>
      </div>
    </div>
    <div class="footer">
      CrushCar — فريق العمل<br/>
      ${process.env.NEXTAUTH_URL || 'http://localhost:3000'}
    </div>
  </div>
</body>
</html>
  `

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `✅ تم تأكيد حجزك — ${data.reference}`,
      html,
    })
    console.log('[Email] Confirmation sent to:', to, data.reference)
  } catch (err) {
    console.error('[Email] Failed to send:', err)
  }
}