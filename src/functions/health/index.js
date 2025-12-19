const { success } = require('utils/response');

exports.handler = async () => {
  return success({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
};
