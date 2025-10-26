const getTimestamp = () => {
  const now = new Date();
  return now.toISOString();
};

const log = (level, message) => {
  console.log(`[${getTimestamp()}] [${level}] ${message}`);
};

module.exports = { log };
