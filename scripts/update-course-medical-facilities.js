
require('module-alias/register'); // for @ path aliases
const { Course, MedicalFacility } = require('@models');
const sequelize = require('@config/database');
const { Op } = require('sequelize');
const { logger } = require('@utils/logger');

// Haversine formula to calculate distance between two lat/lon points
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

async function run() {
  await sequelize.sync(); // Ensure DB is connected and tables are created/updated

  logger.info('Starting to update courses with closest medical facility information...');

  try {
    const courses = await Course.findAll({
      attributes: ['course_id', 'start_lat', 'start_lon'],
      where: {
        start_lat: { [Op.ne]: null },
        start_lon: { [Op.ne]: null },
      },
    });

    const medicalFacilities = await MedicalFacility.findAll({
      attributes: ['hpid', 'latitude', 'longitude'],
      where: {
        latitude: { [Op.ne]: null },
        longitude: { [Op.ne]: null },
      },
    });

    if (medicalFacilities.length === 0) {
      logger.warn('No medical facilities found in the database. Skipping course updates.');
      await sequelize.close();
      return;
    }

    logger.info(`Found ${courses.length} courses and ${medicalFacilities.length} medical facilities.`);

    for (const course of courses) {
      let minDistance = Infinity;
      let closestHpid = null;

      for (const facility of medicalFacilities) {
        if (course.start_lat && course.start_lon && facility.latitude && facility.longitude) {
          const distance = haversineDistance(
            parseFloat(course.start_lat),
            parseFloat(course.start_lon),
            parseFloat(facility.latitude),
            parseFloat(facility.longitude),
          );

          if (distance < minDistance) {
            minDistance = distance;
            closestHpid = facility.hpid;
          }
        }
      }

      if (closestHpid) {
        await course.update({
          closest_medical_facility_hpid: closestHpid,
          distance_to_closest_medical_facility_km: minDistance,
        });
        logger.debug(`Updated course ${course.course_id} with closest facility ${closestHpid} (${minDistance.toFixed(2)} km)`);
      } else {
        logger.warn(`Could not find a closest medical facility for course ${course.course_id}.`);
      }
    }

    logger.info('Finished updating courses with closest medical facility information.');
  } catch (error) {
    logger.error(error, 'An error occurred during course medical facility update:');
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
