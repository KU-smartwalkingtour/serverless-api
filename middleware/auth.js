const jwt = require('jsonwebtoken');
const { logger } = require('@utils/logger');
const { User } = require('@models');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401); // 인증되지 않음
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 토큰의 ID로 데이터베이스에서 사용자 조회
    const user = await User.findOne({ where: { id: decoded.id, is_active: true } });

    if (!user) {
      logger.warn(`인증 실패: 사용자를 찾을 수 없거나 비활성 상태 - ID: ${decoded.id}`);
      return res.sendStatus(403); // 접근 거부
    }

    // Sequelize 사용자 객체를 요청에 첨부
    req.user = user;
    next();
  } catch (err) {
    logger.error(`JWT 검증 오류: ${err.message}`);
    return res.sendStatus(403); // 접근 거부
  }
};

module.exports = { authenticateToken };
