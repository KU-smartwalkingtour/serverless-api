const { success } = require('/opt/nodejs/utils/response');

exports.handler = async () => {
  return success({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
};
