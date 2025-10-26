const express = require('express');
const router = express.Router();
const {
  findClosestCourse,
  getCourseMetadataFromGpx,
  getCoordinatesFromGpx,
  findNClosestCourses,
  getGpxContentFromS3,
} = require('../utils/gpx-resolver');
const { log } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

// Import models
const User = require('../models/user');
const UserSavedCourse = require('../models/userSavedCourse');
const UserCourseHistory = require('../models/userCourseHistory');

/**
 * @swagger
 * tags:
 *   name: Course
 *   description: Walking course discovery and management
 */

// Define model associations
User.hasMany(UserSavedCourse, { foreignKey: 'user_id' });
UserSavedCourse.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(UserCourseHistory, { foreignKey: 'user_id' });
UserCourseHistory.belongsTo(User, { foreignKey: 'user_id' });

// Helper to log course view history
const logCourseView = async (userId, courseId) => {
  try {
    await UserCourseHistory.create({
      user_id: userId,
      provider: 's3', // Assuming s3 provider for viewed courses
      provider_course_id: courseId.toString(),
    });
  } catch (error) {
    log(
      'error',
      `Failed to log course history for user ${userId}, course ${courseId}: ${error.message}`,
    );
  }
};

/**
 * @swagger
 * /course/find-closest:
 *   get:
 *     summary: Find the closest walking course to a given location
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number, format: float }
 *         description: User's latitude.
 *       - in: query
 *         name: lon
 *         required: true
 *         schema: { type: number, format: float }
 *         description: User's longitude.
 *     responses:
 *       200:
 *         description: The closest course found.
 *       400:
 *         description: Missing or invalid lat/lon parameters.
 *       404:
 *         description: No courses found.
 */
router.get('/find-closest', authenticateToken, async (req, res) => {
  try {
    const { lon, lat } = req.query;
    if (lon == null || lat == null) {
      return res
        .status(400)
        .json({ error: 'Longitude(lon) and Latitude(lat) are required query parameters.' });
    }
    const closestCourse = await findClosestCourse(parseFloat(lat), parseFloat(lon));
    if (closestCourse) {
      res.json({ closestCourse });
    } else {
      res
        .status(404)
        .json({ error: 'No courses found or unable to determine the closest course.' });
    }
  } catch (error) {
    log('error', `Error finding closest course: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while finding the closest course.' });
  }
});

/**
 * @swagger
 * /course/find-n-closest:
 *   get:
 *     summary: Find the N closest walking courses to a given location
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number, format: float }
 *         description: User's latitude.
 *       - in: query
 *         name: lon
 *         required: true
 *         schema: { type: number, format: float }
 *         description: User's longitude.
 *       - in: query
 *         name: n
 *         required: true
 *         schema: { type: integer }
 *         description: The number of courses to find.
 *     responses:
 *       200:
 *         description: A list of the N closest courses.
 *       400:
 *         description: Missing or invalid lat/lon/n parameters.
 *       404:
 *         description: No courses found.
 */
router.get('/find-n-closest', authenticateToken, async (req, res) => {
  try {
    const { lon, lat, n } = req.query;
    if (lon == null || lat == null || n == null) {
      return res
        .status(400)
        .json({ error: 'Longitude(lon), Latitude(lat), and N are required query parameters.' });
    }
    const closestCourses = await findNClosestCourses(parseFloat(lat), parseFloat(lon), parseInt(n));
    if (closestCourses) {
      res.json({ closestCourses });
    } else {
      res
        .status(404)
        .json({ error: 'No courses found or unable to determine the closest courses.' });
    }
  } catch (error) {
    log('error', `Error finding closest courses: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while finding the closest courses.' });
  }
});

/**
 * @swagger
 * /course/metadata:
 *   get:
 *     summary: Get metadata for a specific course
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *         description: The provider-specific ID of the course.
 *     responses:
 *       200:
 *         description: The metadata for the course.
 *       400:
 *         description: Missing courseId parameter.
 *       404:
 *         description: Course file not found.
 */
router.get('/metadata', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) {
      return res.status(400).json({ error: 'courseId is a required query parameter.' });
    }
    const gpxContent = await getGpxContentFromS3(courseId);
    if (!gpxContent) {
      return res.status(404).json({ error: 'Course file not found.' });
    }
    const metadata = await getCourseMetadataFromGpx(gpxContent);
    res.json(metadata);
    logCourseView(req.user.id, courseId);
  } catch (error) {
    log('error', `Error fetching course metadata: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while fetching course metadata.' });
  }
});

/**
 * @swagger
 * /course/coordinates:
 *   get:
 *     summary: Get all GPS coordinates for a specific course
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *         description: The provider-specific ID of the course.
 *     responses:
 *       200:
 *         description: An array of coordinates for the course path.
 *       400:
 *         description: Missing courseId parameter.
 *       404:
 *         description: Course file not found.
 */
router.get('/coordinates', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) {
      return res.status(400).json({ error: 'courseId is a required query parameter.' });
    }
    const gpxContent = await getGpxContentFromS3(courseId);
    if (!gpxContent) {
      return res.status(404).json({ error: 'Course file not found.' });
    }
    const coordinates = await getCoordinatesFromGpx(gpxContent);
    res.json(coordinates);
    logCourseView(req.user.id, courseId);
  } catch (error) {
    log('error', `Error fetching course coordinates: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while fetching course coordinates.' });
  }
});

/**
 * @swagger
 * /course/saved:
 *   get:
 *     summary: Get all courses saved by the user
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: A list of saved course records.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserSavedCourse'
 */
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    const savedCourses = await UserSavedCourse.findAll({
      where: { user_id: req.user.id },
      order: [['saved_at', 'DESC']],
    });
    res.json(savedCourses);
  } catch (error) {
    log('error', `Error fetching saved courses: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

/**
 * @swagger
 * /course/history:
 *   get:
 *     summary: Get the user's recently viewed course history
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: A list of recently viewed course records.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserCourseHistory'
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const history = await UserCourseHistory.findAll({
      where: { user_id: req.user.id },
      order: [['viewed_at', 'DESC']],
      limit: 50,
    });
    res.json(history);
  } catch (error) {
    log('error', `Error fetching course history: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

/**
 * @swagger
 * /course/save:
 *   post:
 *     summary: Save a course to the user's list
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, courseId]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [seoul_trail, durunubi]
 *                 description: The source of the course.
 *               courseId:
 *                 type: string
 *                 description: The provider-specific ID of the course to save.
 *     responses:
 *       201:
 *         description: Course saved successfully.
 *       200:
 *         description: Course was already saved.
 *       400:
 *         description: Missing or invalid parameters.
 */
router.post('/save', authenticateToken, async (req, res) => {
  try {
    const { provider, courseId } = req.body;
    if (!courseId || !provider) {
      return res.status(400).json({ error: 'provider and courseId are required.' });
    }

    if (!['seoul_trail', 'durunubi'].includes(provider)) {
      return res
        .status(400)
        .json({ error: "Provider must be one of 'seoul_trail' or 'durunubi'." });
    }

    const [savedCourse, created] = await UserSavedCourse.findOrCreate({
      where: {
        user_id: req.user.id,
        provider: provider,
        provider_course_id: courseId.toString(),
      },
    });

    if (created) {
      res.status(201).json({ message: 'Course saved successfully.', data: savedCourse });
    } else {
      res.status(200).json({ message: 'Course was already saved.', data: savedCourse });
    }
  } catch (error) {
    log('error', `Error saving course: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

/**
 * @swagger
 * /course/unsave:
 *   post:
 *     summary: Unsave a course from the user's list
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, courseId]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [seoul_trail, durunubi]
 *                 description: The source of the course.
 *               courseId:
 *                 type: string
 *                 description: The provider-specific ID of the course to unsave.
 *     responses:
 *       200:
 *         description: Course unsaved successfully.
 *       404:
 *         description: Course not found in saved list.
 *       400:
 *         description: Missing or invalid parameters.
 */
router.post('/unsave', authenticateToken, async (req, res) => {
  try {
    const { provider, courseId } = req.body;
    if (!courseId || !provider) {
      return res.status(400).json({ error: 'provider and courseId are required.' });
    }

    if (!['seoul_trail', 'durunubi'].includes(provider)) {
      return res
        .status(400)
        .json({ error: "Provider must be one of 'seoul_trail' or 'durunubi'." });
    }

    const deletedCount = await UserSavedCourse.destroy({
      where: {
        user_id: req.user.id,
        provider: provider,
        provider_course_id: courseId.toString(),
      },
    });

    if (deletedCount > 0) {
      res.status(200).json({ message: 'Course unsaved successfully.' });
    } else {
      res.status(404).json({ message: 'Course not found in saved list.' });
    }
  } catch (error) {
    log('error', `Error unsaving course: ${error.message}`);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

module.exports = router;
