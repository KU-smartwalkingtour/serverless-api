const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

// 1) SES 클라이언트 생성
const sesClient = new SESv2Client({
  region: "ap-northeast-2"
});

/**
 * SESv2 SDK를 이용하여 메일을 발송합니다.
 * @param {{ toEmail: string, code: string }} params - toEmail은 메일을 보낼 주소, code는 인증 코드(6자리)
 * @returns {Promise<object>} SES 전송 결과 객체
 */
async function sendPasswordResetEmail({ toEmail, code }) {
  // HTML 이메일 템플릿
  const htmlTemplate = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>비밀번호 재설정</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif; background-color: #F9FAFB;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F9FAFB;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">

          <!-- 헤더 -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                🔐 비밀번호 재설정
              </h1>
              <p style="margin: 10px 0 0; color: #E0E7FF; font-size: 14px; font-weight: 500;">
                KU 둘레길 스마트워킹투어
              </p>
            </td>
          </tr>

          <!-- 본문 -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #111827; font-size: 16px; line-height: 1.6;">
                안녕하세요,
              </p>
              <p style="margin: 0 0 30px; color: #4B5563; font-size: 15px; line-height: 1.7;">
                비밀번호 재설정을 위한 인증번호가 발급되었습니다.<br>
                아래의 <strong>6자리 인증번호</strong>를 입력하여 비밀번호를 재설정해 주세요.
              </p>

              <!-- 인증번호 박스 -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 30px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%); border-radius: 12px; border: 2px solid #2563EB; padding: 30px; text-align: center;">
                    <p style="margin: 0 0 12px; color: #4B5563; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                      인증번호
                    </p>
                    <p style="margin: 0; color: #1E40AF; font-size: 42px; font-weight: 700; font-family: 'Courier New', Courier, monospace; letter-spacing: 8px;">
                      ${code}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- 만료 시간 안내 -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 30px;">
                <tr>
                  <td style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px 20px; border-radius: 8px;">
                    <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">
                      ⏰ <strong>유효시간:</strong> 이 인증번호는 발송 시점으로부터 <strong>10분 후</strong> 자동으로 만료됩니다.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- 보안 안내 -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px;">
                <tr>
                  <td style="background-color: #FEE2E2; border-left: 4px solid #DC2626; padding: 16px 20px; border-radius: 8px;">
                    <p style="margin: 0; color: #991B1B; font-size: 14px; line-height: 1.6;">
                      🛡️ <strong>보안 안내:</strong> 본인이 요청하지 않은 경우, 이 메일을 무시하셔도 됩니다. 인증번호는 타인에게 절대 공유하지 마세요.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                감사합니다.<br>
                <strong>KU 둘레길 팀 드림</strong>
              </p>
            </td>
          </tr>

          <!-- 푸터 -->
          <tr>
            <td style="padding: 30px 40px; background-color: #F9FAFB; border-radius: 0 0 12px 12px; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0 0 10px; color: #9CA3AF; font-size: 12px; line-height: 1.6; text-align: center;">
                이 메일은 발신 전용입니다. 문의사항은 고객센터를 이용해 주세요.
              </p>
              <p style="margin: 0; color: #9CA3AF; font-size: 12px; line-height: 1.6; text-align: center;">
                © 2024 건국대학교 스마트워킹투어. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const command = new SendEmailCommand({
    FromEmailAddress: "no-reply@ku-smartwalkingtour.site",
    Destination: {
      ToAddresses: [toEmail],
    },
    Content: {
      Simple: {
        Subject: {
          Data: "🔐 [KU 둘레길] 비밀번호 재설정 인증코드",
        },
        Body: {
          Html: {
            Data: htmlTemplate,
          },
        },
      },
    },
  });

  const result = await sesClient.send(command);
  return result;
}

module.exports = { sendPasswordResetEmail };