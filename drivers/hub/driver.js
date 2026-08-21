'use strict';

const Homey = require('homey');
const axios = require('axios');

module.exports = class HubDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Hub driver has been initialized');
  }

  async onPair(session) {
    this.log('Hub driver pairing has started');
    session.setHandler("showView", async (viewId) => {
      if (viewId === 'login') {
        const loggedIn = this.homey.settings.get('loggedIn');
        if (loggedIn) {
          await session.showView('list_devices');
        }
      }
    });
    session.setHandler("login", async (data) => {
      try {
        const user = data.email;
        const password = data.password;
        if (!data.email || !data.password) {
          return false;
        }
        const response = await axios.post('https://cloud.3reality.com/realitycloudserver/user/login', {
          data: {
            requester: "APP",
            account: user,
            password: password
          },
          version: "V1.0.0"
        });
        if (!response.data.result.data.token || !response.data.result.data.userId) {
          return false;
        }
        this.homey.settings.set('user', user);
        this.homey.settings.set('password', password);
        this.homey.settings.set('loggedIn', true);
        this.homey.settings.set('token', response.data.result.data.token);
        this.homey.settings.set('userId', response.data.result.data.userId);
        await this.homey.app.connectIfLoggedIn();
        await session.showView('list_devices');
        return true;
      } catch (error) {
        if (error.response && error.response.status === 401) {
          return false;
        }
        throw new Error("Error during login check: " + error.message);
      }
    });

    session.setHandler("list_devices", async () => {
      try {
        return await this.onPairListDevices();
      } catch (error) {
        throw new Error("Error while fetching devices: " + error.message);
      }
    });
  }

  async onRepair(session) {
    this.log('Hub driver repairing has started');
    session.setHandler("login", async (data) => {
      try {
        const user = data.email;
        const password = data.password;
        if (!data.email || !data.password) {
          return false;
        }
        const response = await axios.post('https://cloud.3reality.com/realitycloudserver/user/login', {
          data: {
            requester: "APP",
            account: user,
            password: password
          },
          version: "V1.0.0"
        });
        if (!response.data.result.data.token || !response.data.result.data.userId) {
          return false;
        }
        this.homey.settings.set('user', user);
        this.homey.settings.set('password', password);
        this.homey.settings.set('loggedIn', true);
        this.homey.settings.set('token', response.data.result.data.token);
        this.homey.settings.set('userId', response.data.result.data.userId);
        await this.homey.app.connectIfLoggedIn();
        await session.done();
        return true;
      } catch (error) {
        if (error.response && error.response.status === 401) {
          return false;
        }
        throw new Error("Error during login check: " + error.message);
      }
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    try {
      const token = this.homey.settings.get('token');
      const userId = this.homey.settings.get('userId');
      if (!token || !userId) {
        throw new Error("User is not logged in");
      }
      const response = await axios.get(`https://cloud.3reality.com/realitycloudserver/users/${userId}/device`, {
        headers: {
          'auth-token': token,
        },
      });
      if (!response.data.result || !response.data.result.data || !Array.isArray(response.data.result.data)) {
        throw new Error("Invalid response from device list API");
      }
      const devices = response.data.result.data
      .filter(device => device.thingType === "HUB")
      .map(device => ({
        name: device.friendlyName,
        data: {
          id: device.thingName,
        },
      }));
      return devices;
    } catch (error) {
      this.error("Error while fetching devices: " + error.message);
      throw new Error("Something went wrong while retrieving the device list. Please try again.");
    }
  }

};
