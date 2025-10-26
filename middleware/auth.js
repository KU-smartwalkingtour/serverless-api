const jwt = require('jsonwebtoken');
const { log } = require('../utils/logger');
const User = require('../models/user');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401); // Unauthorized
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch the user from the database using the ID from the token
    const user = await User.findOne({ where: { id: decoded.id, is_active: true } });

    if (!user) {
      log('warn', `Authentication failed: User not found or inactive for ID: ${decoded.id}`);
      return res.sendStatus(403); // Forbidden
    }

    // Attach the Sequelize user object to the request
    req.user = user;
    next();
  } catch (err) {
    log('error', `JWT verification error: ${err.message}`);
    return res.sendStatus(403); // Forbidden
  }
};

module.exports = { authenticateToken };
