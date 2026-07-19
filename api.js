const axios = require('axios');

module.exports = {
  async getDebugData({ homey}) {
    const app = homey.app;
    const token = homey.settings.get('token');
    const userId = homey.settings.get('userId');
    const response = await axios.get(`https://cloud.3reality.com/realitycloudserver/users/${userId}/device`, {
    headers: {
        'auth-token': token,
    },
    });
    return response.data.result.data.map(device => ({
      siteId: device.deviceId,
      siteName: device.friendlyName,
      clients: device
    }));
  },

  async send({ homey, body }) {
    try {
      const { message, deviceId, deviceName, data } = body;

      if (!message || !data) {
        throw new Error('Missing required fields');
      }

      const response = await axios.post('https://device-support-requests.vercel.app/api/send-report', {
        message: message,
        app: 'ThirdReality Hub',
        report: {
          deviceId: deviceId,
          deviceName: deviceName,
          data: data
        }
      });

      return {
        success: true,
        id: response.data.id
      };
    } catch (error) {
      this.homey.app.error('Error sending to support:', error.message);
      throw new Error(error.response?.data?.error || error.message);
    }
  }
};