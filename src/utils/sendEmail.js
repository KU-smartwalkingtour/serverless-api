const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION || 'ap-northeast-2',
});

const SENDER_EMAIL = 'no-reply@ku-smartwalkingtour.site';

async function sendPasswordResetEmail({ toEmail, code }) {
  const htmlTemplate = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>비밀번호 재설정</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #F0FDF4;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F0FDF4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; box-shadow: 0 4px 12px rgba(22, 101, 52, 0.08);">
          <tr>
            <td style="padding: 48px 40px 36px; text-align: center; background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius: 16px 16px 0 0;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 28px; font-weight: 700;">비밀번호 재설정</h1>
              <p style="margin: 12px 0 0; color: #D1FAE5; font-size: 14px;">KU 둘레길 스마트워킹투어</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 48px 40px;">
              <p style="margin: 0 0 20px; color: #111827; font-size: 16px;">안녕하세요,</p>
              <p style="margin: 0 0 32px; color: #4B5563; font-size: 15px; line-height: 1.7;">
                비밀번호 재설정을 위한 인증번호가 발급되었습니다.<br>
                아래의 <strong>6자리 인증번호</strong>를 입력하여 비밀번호를 재설정해 주세요.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 32px;">
                <tr>
                  <td style="background-color: #ECFDF5; border-radius: 12px; padding: 32px; text-align: center;">
                    <p style="margin: 0 0 12px; color: #059669; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">인증번호</p>
                    <p style="margin: 0; color: #047857; font-size: 42px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 8px;">${code}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px;">
                <tr>
                  <td style="background-color: #FEF9C3; padding: 16px 20px; border-radius: 10px;">
                    <p style="margin: 0; color: #854D0E; font-size: 14px;">
                      <strong>유효시간:</strong> 이 인증번호는 발송 시점으로부터 <strong>10분 후</strong> 자동으로 만료됩니다.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px;">
                <tr>
                  <td style="background-color: #F0FDFA; padding: 16px 20px; border-radius: 10px;">
                    <p style="margin: 0; color: #0F766E; font-size: 14px;">
                      <strong>보안 안내:</strong> 본인이 요청하지 않은 경우, 이 메일을 무시하셔도 됩니다.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; color: #6B7280; font-size: 14px;">
                감사합니다.<br>
                <strong style="color: #059669;">KU 둘레길 팀 드림</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; background-color: #F9FAFB; border-radius: 0 0 16px 16px; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px; text-align: center;">
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
    FromEmailAddress: SENDER_EMAIL,
    Destination: {
      ToAddresses: [toEmail],
    },
    Content: {
      Simple: {
        Subject: {
          Data: '[KU 둘레길] 비밀번호 재설정 인증코드',
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
