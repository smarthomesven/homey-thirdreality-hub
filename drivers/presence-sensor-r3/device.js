'use strict';
const Homey = require('homey');

module.exports = class MutilPLSDevice extends Homey.Device {

  async onInit() {
    const capabilities = ['onoff', 'dim', 'light_hue', 'light_saturation', 'light_temperature', 'alarm_presence', 'measure_tvoc'];
    for (const cap of capabilities) {
      if (!this.hasCapability(cap)) await this.addCapability(cap);
    }

    this.registerCapabilityListener('onoff', async (value) => {
      this.publishDesired({ OnOff: value ? 'ON' : 'OFF' });
    });

    this.registerCapabilityListener('dim', async (value) => {
      this.publishDesired({ brightness: Math.round(value * 100) });
    });

    this.registerCapabilityListener('light_hue', async (value) => {
      const sat = this.getCapabilityValue('light_saturation') ?? 1;
      this.publishDesired({ color: `hs(${Math.round(value * 360)},${Math.round(sat * 100)})` });
    });

    this.registerCapabilityListener('light_saturation', async (value) => {
      const hue = this.getCapabilityValue('light_hue') ?? 0;
      this.publishDesired({ color: `hs(${Math.round(hue * 360)},${Math.round(value * 100)})` });
    });

    this.registerCapabilityListener('light_temperature', async (value) => {
      const { min, max } = this._miredRange();
      const mired = min + value * (max - min);
      const kelvin = Math.round(1e6 / mired);
      this.publishDesired({ colorTemperatureInKelvin: kelvin });
    });

    const thingId = this.getData().id;
    this.homey.app.subscribeDevice(thingId);
    this.homey.app.requestShadow(thingId); // pull current state immediately
    this.log('MutilPLS device has been initialized');
  }

  publishDesired(fields) {
    const thingId = this.getData().id;
    this.homey.app.publishMqtt(
      `$aws/things/${thingId}/shadow/update`,
      JSON.stringify({ state: { desired: fields } })
    );
  }

  _miredRange() {
    // Falls back to sane defaults if not yet reported
    return {
      min: this._minMired ?? 153,
      max: this._maxMired ?? 500,
    };
  }

  async onShadowUpdate(reported) {
    if ('connected' in reported) {
      if (reported.connected === 'true') {
        await this.setAvailable();
      } else {
        await this.setUnavailable(this.homey.__('errors.unreachable'));
        return;
      }
    }

    // Cache mired range for temperature conversion
    if ('colorTemperatureMinMired' in reported) this._minMired = reported.colorTemperatureMinMired;
    if ('colorTemperatureMaxMired' in reported) this._maxMired = reported.colorTemperatureMaxMired;

    const setSafe = async (cap, value) => {
      if (!this.hasCapability(cap)) return;
      try { await this.setCapabilityValue(cap, value); }
      catch (e) { this.log(`[Device] Failed to set ${cap}:`, e.message); }
    };

    if ('OnOff' in reported) await setSafe('onoff', reported.OnOff === 'ON');
    if ('brightness' in reported) await setSafe('dim', reported.brightness / 100);
    if ('motionStatus' in reported) await setSafe('alarm_presence', reported.motionStatus === 'ON');
    if ('tvoc' in reported) await setSafe('measure_tvoc', reported.tvoc);

    if ('color' in reported) {
      // Format observed: "hs(239,100)" -> hue degrees, saturation percent
      const m = reported.color.match(/hs\((\d+),(\d+)\)/);
      if (m) {
        await setSafe('light_hue', parseInt(m[1], 10) / 360);
        await setSafe('light_saturation', parseInt(m[2], 10) / 100);
      }
    }

    if ('colorTemperatureInKelvin' in reported) {
      const { min, max } = this._miredRange();
      const mired = 1e6 / reported.colorTemperatureInKelvin;
      const normalized = Math.min(1, Math.max(0, (mired - min) / (max - min)));
      await setSafe('light_temperature', normalized);
    }
  }

  async onDeleted() {
    this.log('Multinl device has been deleted');
  }

  async onUninit() {
    const thingId = this.getData().id;
    this.homey.app.unsubscribeDevice(thingId);
  }
};