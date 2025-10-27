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
  const command = new SendEmailCommand({
    FromEmailAddress: "no-reply@ku-smartwalkingtour.site",
    Destination: {
      ToAddresses: [toEmail],
    },
    Content: {
      Simple: {
        Subject: {
          Data: "[KU 둘레길] 비밀번호 재설정 안내",
        },
        Body: {
          Text: {
            Data:
              `인증번호: ${code}\n` +
              `이 코드는 10분 후 만료됩니다.\n\n` +
              `본인이 요청하지 않은 경우 이 메일은 무시하셔도 됩니다.`,
          },
          // 필요하면 HTML 본문도 넣을 수 있음:
          // Html: {
          //   Data: `<p>인증번호: <strong>${code}</strong></p><p>유효시간: 10분</p>`,
          // },
        },
      },
    },
  });

  const result = await sesClient.send(command);
  return result;
}

module.exports = { sendPasswordResetEmail };