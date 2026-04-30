'use strict';

const Homey = require('homey');

const CAPABILITY_MAP = {
  OnOff:        { capability: 'onoff',              transform: v => v === 'ON' },
  activePower:  { capability: 'measure_power',      transform: v => parseFloat(v) },
  rmsVoltage:   { capability: 'measure_voltage',    transform: v => parseFloat(v) },
  rmsCurrent:   { capability: 'measure_current',    transform: v => parseFloat(v) },
  meteringSum:  { capability: 'meter_power',        transform: v => parseFloat(v) },
};

module.exports = class MyDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    if (!this.hasCapability('onoff')) {
      await this.addCapability('onoff');
    }
    if (!this.hasCapability('measure_power')) {
      await this.addCapability('measure_power');
    }
    if (!this.hasCapability('measure_voltage')) {
      await this.addCapability('measure_voltage');
    }
    if (!this.hasCapability('measure_current')) {
      await this.addCapability('measure_current');
    }
    if (!this.hasCapability('meter_power')) {
      await this.addCapability('meter_power');
    }
    this.registerCapabilityListener('onoff', async (value) => {
      await this.setOnOff(value);
    });
    const thingId = this.getData().id; // or this.getStoreValue('thingId')
    this.homey.app.subscribeDevice(thingId);
    this.log('MyDevice has been initialized');
  }

  async setOnOff(value) {
    const thingId = this.getData().id;
    const desired = { state: { desired: { OnOff: value ? 'ON' : 'OFF' } } };
    this.homey.app.publishMqtt(
      `$aws/things/${thingId}/shadow/update`,
      JSON.stringify(desired)
    );
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

    for (const [key, { capability, transform }] of Object.entries(CAPABILITY_MAP)) {
      if (!(key in reported)) continue;
      if (!this.hasCapability(capability)) continue;

      const value = transform(reported[key]);
      try {
        await this.setCapabilityValue(capability, value);
      } catch (e) {
        this.log(`[Device] Failed to set ${capability}:`, e.message);
      }
    }
  }


  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Smart Plug device has been added');
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
    this.log('Smart Plug device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Smart Plug device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Smart Plug device has been deleted');
  }

  async onUnit() {
    const thingId = this.getData().id;
    this.homey.app.unsubscribeDevice(thingId);
  }

};
