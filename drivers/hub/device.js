'use strict';

const Homey = require('homey');

const CAPABILITY_MAP = {
  rssi:  {
    capability: 'measure_signal_strength', transform: v => parseFloat(v) 
  },
};

module.exports = class HubDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    const thingId = this.getData().id; // or this.getStoreValue('thingId')
    this.homey.app.subscribeDevice(thingId);
    this.log('Hub Device has been initialized');
  }
  async onShadowUpdate(reported) {
    // Handle availability based on connected field
    if ('connected' in reported) {
      if (reported.connected === 'true') {
        await this.setAvailable();
      } else {
        await this.setUnavailable(this.homey.__('errors.unreachable'));
        return; // Don't update stale capability values if device is offline
      }
    }

    if ('rssi' in reported) {
      await this.setCapabilityValue('measure_signal_strength', reported.rssi);
    }
  }


  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Hub device has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Hub device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Hub device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Hub device has been deleted');
  }

  async onUninit() {
    const thingId = this.getData().id;
    this.homey.app.unsubscribeDevice(thingId);
  }

};
