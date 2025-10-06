const express = require('express');
const router = express.Router();
const { findClosestCourse, getCourseMetadataFromGpx, getCoordinatesFromGpx, findNClosestCourses } = require('../utils/gpx-resolver');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Course
 *   description: Walking course information
 */

/**
 * @swagger
 * /course/find-closest:
 *   get:
 *     summary: Find the closest walking course
 *     tags: [Course]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lon
 *         schema:
 *           type: number
 *         required: true
 *         description: User's longitude.
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         required: true
 *         description: User's latitude.
 *     responses:
 *       200:
 *         description: Successful response with the closest course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 closestCourse:
 *                   type: string
 *                   description: The name of the closest course.
 *       400:
 *         description: Longitude(lon) and Latitude(lat) are required query parameters.
 *       401:
 *         description: Unauthorized (token not provided)
 *       403:
 *         description: Forbidden (invalid token)
 *       500:
 *         description: An error occurred while finding the closest course.
 */
router.get('/find-closest', authenticateToken, async (req, res) => {
  try {
    const { lon, lat } = req.query;

    if (lon == null || lat == null) {
      return res.status(400).json({ 
        error: 'Longitude(lon) and Latitude(lat) are required query parameters.' 
      });
    }

    const closestCourse = await findClosestCourse(parseFloat(lat), parseFloat(lon));
    
    if (closestCourse) {
      res.json({ closestCourse });
    } else {
      res.status(404).json({ error: 'No courses found or unable to determine the closest course.' });
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
 *     summary: Find the N closest walking courses
 *     tags: [Course]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lon
 *         schema:
 *           type: number
 *         required: true
 *         description: User's longitude.
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         required: true
 *         description: User's latitude.
 *       - in: query
 *         name: n
 *         schema:
 *           type: integer
 *         required: true
 *         description: Number of closest courses to find.
 *     responses:
 *       200:
 *         description: Successful response with the N closest courses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 closestCourses:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: The names of the N closest courses.
 *       400:
 *         description: Longitude(lon), Latitude(lat), and N are required query parameters.
 *       401:
 *         description: Unauthorized (token not provided)
 *       403:
 *         description: Forbidden (invalid token)
 *       500:
 *         description: An error occurred while finding the closest courses.
 */
router.get('/find-n-closest', authenticateToken, async (req, res) => {
  try {
    const { lon, lat, n } = req.query;

    if (lon == null || lat == null || n == null) {
      return res.status(400).json({ 
        error: 'Longitude(lon), Latitude(lat), and N are required query parameters.' 
      });
    }

    const closestCourses = await findNClosestCourses(parseFloat(lat), parseFloat(lon), parseInt(n));
    
    if (closestCourses) {
      res.json({ closestCourses });
    } else {
      res.status(404).json({ error: 'No courses found or unable to determine the closest courses.' });
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: courseNumber
 *         schema:
 *           type: integer
 *         required: true
 *         description: The number of the course to get metadata for.
 *     responses:
 *       200:
 *         description: Successful response with the course metadata.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: courseNumber is a required query parameter.
 *       401:
 *         description: Unauthorized (token not provided)
 *       403:
 *         description: Forbidden (invalid token)
 *       404:
 *         description: Course file not found.
 *       500:
 *         description: An error occurred while fetching course metadata.
 */
router.get('/metadata', authenticateToken, async (req, res) => {
  try {
    const { courseNumber } = req.query;

    if (!courseNumber) {
      return res.status(400).json({ 
        error: 'courseNumber is a required query parameter.' 
      });
    }

    const fileName = `서울둘레길2.0_${courseNumber}코스.gpx`;
    const filePath = path.join(__dirname, '../utils/gpx_files', fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Course file not found.' });
    }

    const gpxContent = await fs.promises.readFile(filePath, 'utf8');
    const metadata = await getCourseMetadataFromGpx(gpxContent);
    
    res.json(metadata);

  } catch (error) {
    log('error', `Error fetching course metadata: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while fetching course metadata.' });
  }
});

/**
 * @swagger
 * /course/coordinates:
 *   get:
 *     summary: Get all coordinates for a specific course
 *     tags: [Course]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: courseNumber
 *         schema:
 *           type: integer
 *         required: true
 *         description: The number of the course to get coordinates for.
 *     responses:
 *       200:
 *         description: Successful response with the course coordinates.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lon:
 *                     type: number
 *       400:
 *         description: courseNumber is a required query parameter.
 *       401:
 *         description: Unauthorized (token not provided)
 *       403:
 *         description: Forbidden (invalid token)
 *       404:
 *         description: Course file not found.
 *       500:
 *         description: An error occurred while fetching course coordinates.
 */
router.get('/coordinates', authenticateToken, async (req, res) => {
  try {
    const { courseNumber } = req.query;

    if (!courseNumber) {
      return res.status(400).json({ 
        error: 'courseNumber is a required query parameter.' 
      });
    }

    const fileName = `서울둘레길2.0_${courseNumber}코스.gpx`;
    const filePath = path.join(__dirname, '../utils/gpx_files', fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Course file not found.' });
    }

    const gpxContent = await fs.promises.readFile(filePath, 'utf8');
    const coordinates = await getCoordinatesFromGpx(gpxContent);
    
    res.json(coordinates);

  } catch (error) {
    log('error', `Error fetching course coordinates: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while fetching course coordinates.' });
  }
});

module.exports = router;
