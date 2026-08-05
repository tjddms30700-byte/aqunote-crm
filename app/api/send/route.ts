import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/send
 * body: { channel: 'sms'|'kakao'|'email', to: string, message: string }
 * 
 * MVP 버전: 실제 발송 대신 로그 저장.
 * 향후 Solapi, NHN Cloud 알림톡 API, EmailJS 등 연동 가능.
 */
export async function POST(req: NextRequest) {
  try {
    const { channel, to, message, name } = await req.json();
    if (!channel || !to || !message) {
      return NextResponse.json({ error: "channel, to, message 필수" }, { status: 400 });
    }

    // TODO: 실제 발송 로직 연동
    // 예시 - SMS: fetch('https://api.solapi.com/messages/v4/send', {...})
    // 예시 - 카카오톡: fetch('https://kakaoapi.aligo.in/akv10/send/', {...})

    console.log(`[${channel.toUpperCase()}] → ${name || ""} (${to}): ${message.slice(0, 80)}`);

    return NextResponse.json({
      success: true,
      channel,
      to,
      preview: message.slice(0, 100),
      note: "MVP: 실제 발송은 API 키 연동 후 활성화됩니다. 지금은 콘솔에 기록만 저장됩니다.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
