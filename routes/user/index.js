const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { log } = require('../utils/logger');
const { Sequelize } = require('sequelize');

// Import models with associations
const { User, UserLocation, UserStat } = require('../models');

/**
 * @swagger
 * tags:
 *   name: User
 *   description: User profile, stats, and location
 */

/**
 * @swagger
 * /user/profile:
 *   get:
 *     summary: Get the current user's profile
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: The user's profile information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 email: { type: string, format: email }
 *                 nickname: { type: string }
 *                 language: { type: string }
 *                 distance_unit: { type: string, enum: [km, mi] }
 *                 created_at: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 */
router.get('/profile', authenticateToken, async (req, res) => {
  const { id, email, nickname, language, distance_unit, created_at } = req.user;
  res.json({ id, email, nickname, language, distance_unit, created_at });
});

/**
 * @swagger
 * /user/profile:
 *   put:
 *     summary: Update the current user's profile
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname: { type: string }
 *               language: { type: string }
 *               distance_unit: { type: string, enum: [km, mi] }
 *     responses:
 *       200:
 *         description: Profile updated successfully.
 *       400:
 *         description: No update fields provided.
 *       401:
 *         description: Unauthorized.
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { nickname, language, distance_unit } = req.body;
    const user = req.user;

    const updates = {};
    if (nickname !== undefined) updates.nickname = nickname;
    if (language !== undefined) updates.language = language;
    if (distance_unit !== undefined) updates.distance_unit = distance_unit;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No update fields provided.' });
    }

    await user.update(updates);

    log('info', `User profile updated for user: ${user.email}`);
    res.status(200).json({ message: 'Profile updated successfully.' });
  } catch (error) {
    log('error', `Error updating user profile: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

/**
 * @swagger
 * /user/location:
 *   post:
 *     summary: Update the user's last known location
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, format: float }
 *               longitude: { type: number, format: float }
 *     responses:
 *       200:
 *         description: Location updated successfully.
 *       400:
 *         description: Missing latitude or longitude.
 *       401:
 *         description: Unauthorized.
 */
router.post('/location', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    await UserLocation.upsert({
      user_id: req.user.id,
      latitude,
      longitude,
    });

    res.status(200).json({ message: 'Location updated successfully.' });
  } catch (error) {
    log('error', `Error updating user location: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

/**
 * @swagger
 * /user/stats:
 *   get:
 *     summary: Get the user's statistics
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: The user's statistics.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserStat'
 *       401:
 *         description: Unauthorized.
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [stats] = await UserStat.findOrCreate({
      where: { user_id: req.user.id },
    });
    res.json(stats);
  } catch (error) {
    log('error', `Error fetching user stats: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

/**
 * @swagger
 * /user/stats/walk:
 *   post:
 *     summary: Add distance to the user's total walk distance
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [distance_km]
 *             properties:
 *               distance_km: { type: number, format: float, description: "The distance walked in kilometers." }
 *     responses:
 *       200:
 *         description: Walk distance logged successfully.
 *       400:
 *         description: Invalid or missing distance_km.
 *       401:
 *         description: Unauthorized.
 */
router.post('/stats/walk', authenticateToken, async (req, res) => {
  try {
    const { distance_km } = req.body;
    if (distance_km == null || isNaN(distance_km) || distance_km < 0) {
      return res.status(400).json({ error: 'A valid positive distance_km is required.' });
    }

    const [stats] = await UserStat.findOrCreate({
      where: { user_id: req.user.id },
    });

    await stats.increment('total_walk_distance_km', { by: distance_km });

    const newTotal = parseFloat(stats.total_walk_distance_km) + parseFloat(distance_km);

    log('info', `Logged ${distance_km}km walk for user ${req.user.email}`);
    res.status(200).json({ message: 'Walk distance logged successfully.', new_total: newTotal });
  } catch (error) {
    log('error', `Error logging walk distance: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

module.exports = router;
