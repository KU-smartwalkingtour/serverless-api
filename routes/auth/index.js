const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { log } = require('../utils/logger');
const { Sequelize } = require('sequelize');

// Import models
const User = require('../models/user');
const AuthRefreshToken = require('../models/authRefreshToken');
const PasswordResetRequest = require('../models/passwordResetRequest');

// Define model associations
User.hasMany(AuthRefreshToken, { foreignKey: 'user_id' });
AuthRefreshToken.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(PasswordResetRequest, { foreignKey: 'user_id' });
PasswordResetRequest.belongsTo(User, { foreignKey: 'user_id' });

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User authentication and authorization
 */

// Helper function to generate tokens
const generateTokens = async (user) => {
  const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await AuthRefreshToken.create({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return { accessToken, refreshToken };
};

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               nickname:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully. Returns tokens and user info.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *                 refreshToken: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     email: { type: string, format: email }
 *                     nickname: { type: string }
 *       400:
 *         description: Email and password are required
 *       409:
 *         description: User with this email already exists
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const newUser = await User.create({ email, password_hash, nickname });

    log('info', `New user registered: ${email}`);
    const { accessToken, refreshToken } = await generateTokens(newUser);
    res
      .status(201)
      .json({
        accessToken,
        refreshToken,
        user: { id: newUser.id, email: newUser.email, nickname: newUser.nickname },
      });
  } catch (error) {
    log('error', `Error during registration: ${error.message}`);
    res.status(500).json({ error: 'An error occurred during registration.' });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Login successful. Returns tokens and user info.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *                 refreshToken: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     email: { type: string, format: email }
 *                     nickname: { type: string }
 *       400:
 *         description: Email and password are required
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ where: { email, is_active: true } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    await AuthRefreshToken.update(
      { revoked_at: new Date() },
      {
        where: { user_id: user.id, revoked_at: null },
      },
    );

    const { accessToken, refreshToken } = await generateTokens(user);

    log('info', `User logged in: ${email}`);
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, nickname: user.nickname },
    });
  } catch (error) {
    log('error', `Error during login: ${error.message}`);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Obtain a new access token using a refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *       401:
 *         description: Refresh token not provided.
 *       403:
 *         description: Invalid, expired, or revoked refresh token.
 */
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token not provided.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = await AuthRefreshToken.findOne({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
        expires_at: { [Sequelize.Op.gt]: new Date() },
      },
    });

    if (!storedToken) {
      return res.status(403).json({ error: 'Invalid or expired refresh token.' });
    }

    const user = await User.findByPk(storedToken.user_id);
    if (!user) {
      return res.status(403).json({ error: 'User not found.' });
    }

    const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    res.json({ accessToken });
  } catch (error) {
    log('error', `Error during token refresh: ${error.message}`);
    res.status(500).json({ error: 'An error occurred during token refresh.' });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Log out the user by revoking their refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Logged out successfully.
 */
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await AuthRefreshToken.update(
      { revoked_at: new Date() },
      {
        where: { token_hash: tokenHash },
      },
    );
  }
  res.status(200).json({ message: 'Logged out successfully.' });
});

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: If a user with that email exists, a password reset code has been sent.
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (user) {
      const code = crypto.randomInt(100000, 999999).toString();
      const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await PasswordResetRequest.create({
        user_id: user.id,
        code,
        expires_at,
      });

      log('info', `Password reset code for ${email}: ${code}`);
    }

    res
      .status(200)
      .json({ message: 'If a user with that email exists, a password reset code has been sent.' });
  } catch (error) {
    log('error', `Error during forgot password: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with a valid code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, password]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, description: "The 6-digit code sent to the user." }
 *               password: { type: string, format: password, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password has been reset successfully.
 *       400:
 *         description: Invalid or expired reset code, or missing parameters.
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body;

    if (!email || !code || !password) {
      return res.status(400).json({ error: 'Email, code, and new password are required.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or code.' });
    }

    const resetRequest = await PasswordResetRequest.findOne({
      where: {
        user_id: user.id,
        code,
        consumed: false,
        expires_at: { [Sequelize.Op.gt]: new Date() },
      },
    });

    if (!resetRequest) {
      return res.status(400).json({ error: 'Invalid or expired reset code.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await user.update({ password_hash });

    await resetRequest.update({ consumed: true, verified_at: new Date() });

    log('info', `Password reset for user: ${email}`);
    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    log('error', `Error during password reset: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

module.exports = router;
