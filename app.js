'use strict';

const Homey = require('homey');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports = class MyApp extends Homey.App {

  async onInit() {
    this.log('MyApp has been initialized');
    // generate ID, random UUID
    try {
      const { randomUUID } = require('crypto');
      let id = this.homey.settings.get('id');
      if (!id) {
        id = randomUUID();
        this.homey.settings.set('id', id);
      }
      await axios.post('https://homey-apps-telemetry.vercel.app/api/installations', {
        id: id,
        appId: "com.3reality.cloud",
        homeyPlatform: this.homey.platformVersion ? this.homey.platformVersion : 1,
        appVersion: this.manifest.version,
      }).catch(error => {
        this.error('Error sending telemetry data:', error.message);
      });
    } catch (error) {
      this.error('Error in onInit:', error.message);
    }
    this.mqttClient = null;
    this._pendingThingIds = new Set();

    await this.connectIfLoggedIn();
  }

  async connectIfLoggedIn() {
    if (!this.homey.settings.get('loggedIn')) {
      this.log('[App] Not logged in, skipping MQTT connect');
      return;
    }

    try {
      const userId = this.homey.settings.get('userId');
      const response = await axios.post('https://cloud.3reality.com/realitycloudserver/thing', {
        data: {
          requester: "APP",
          realityId: userId,
          thingType: "USER",
          newEndpoint: true
        },
        version: "V1.0.0"
      });
      const data = response.data.result.data;
      this.connectMqtt({ host: data.clientEndPoint, clientId: data.thingName, cert: data.certificate, key: data.key });
    } catch (error) {
      this.log('Error during MQTT connection setup:', error.message);
    }
  }

  connectMqtt({ host, clientId, cert, key }) {
    const normalizePem = pem => pem.replace(/\\n/g, '\n');

    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }

    const ca = fs.readFileSync(path.join(__dirname, 'AmazonRootCA1.pem'), 'utf-8');

    const client = mqtt.connect({
      host,
      port: 8883,
      protocol: 'mqtts',
      clientId,
      cert: normalizePem(cert),
      key:  normalizePem(key),
      ca: normalizePem(ca),
      rejectUnauthorized: true,
    });

    client.on('connect', () => {
      this.log(`[MQTT] Connected to ${host}`);
      this._flushPendingSubscriptions();
    });

    client.on('message', (topic, payload) => {
      //this.log(`[MQTT] ${topic}: ${payload.toString()}`);

      // Only handle shadow document updates
      // Topic format: $aws/things/<thingId>/shadow/update/documents
      const match = topic.match(/^\$aws\/things\/([^/]+)\/shadow\/update\/documents$/);
      if (!match) return;

      const thingId = match[1];
      let state;
      try {
        const parsed = JSON.parse(payload.toString());
        state = parsed?.current?.state?.reported;
      } catch (e) {
        this.log('[MQTT] Failed to parse shadow document:', e.message);
        return;
      }

      if (!state) return;

      // Find the device instance and push the state to it
      const drivers = this.homey.drivers.getDrivers();
      for (const driver of Object.values(drivers)) {
        for (const device of driver.getDevices()) {
          if (device.getData().id === thingId) {
            device.onShadowUpdate(state).catch(e => this.error('[MQTT] onShadowUpdate error:', e.message));
            return;
          }
        }
      }
    });

    client.on('error', err => {
      this.log('[MQTT] Error:', err.message);
    });

    client.on('close', () => {
      this.log('[MQTT] Connection closed');
    });

    client.on('reconnect', () => {
      this.log('[MQTT] Reconnecting...');
    });

    this.mqttClient = client;
  }

  publishMqtt(topic, payload) {
    if (!this.mqttClient?.connected) {
      this.log(`[MQTT] Cannot publish to ${topic}: not connected`);
      return;
    }
    this.mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) this.log(`[MQTT] Publish error on ${topic}:`, err.message);
      else     this.log(`[MQTT] Published to ${topic}: ${payload}`);
    });
  }

  _subscribeThingId(thingId) {
    const topic = `$aws/things/${thingId}/#`;
    this.mqttClient.subscribe(topic, { qos: 1 }, (err) => {
      if (err) this.log(`[MQTT] Subscribe error for ${topic}:`, err.message);
      else     this.log(`[MQTT] Subscribed to ${topic}`);
    });
  }

  _flushPendingSubscriptions() {
    for (const thingId of this._pendingThingIds) {
      this._subscribeThingId(thingId);
    }
    this._pendingThingIds.clear();
  }

  subscribeDevice(thingId) {
    if (this.mqttClient?.connected) {
      this._subscribeThingId(thingId);
    } else {
      this.log(`[MQTT] Queuing subscription for ${thingId}`);
      this._pendingThingIds.add(thingId);
    }
  }

  unsubscribeDevice(thingId) {
    // Remove from queue if not yet subscribed
    this._pendingThingIds.delete(thingId);

    if (!this.mqttClient?.connected) return;
    const topic = `$aws/things/${thingId}/#`;
    this.mqttClient.unsubscribe(topic, () => {
      this.log(`[MQTT] Unsubscribed from ${topic}`);
    });
  }

  async onUninit() {
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.log('[MQTT] Client destroyed on app uninit');
    }
  }

};