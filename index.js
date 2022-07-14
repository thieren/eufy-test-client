const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { EufySecurity, Device, PropertyName } = require('eufy-security-client');
const ffmpegPath = require('ffmpeg-for-homebridge');

const bunyan = require('bunyan');

const mp3Path = require.resolve('./sample.mp3');

const { config } = require('./config');

if (config.username == '*****' || config.password == '*****') {
  console.log('You have to specify login credentials in ./config.js');
  process.exit();
}

config.persistentDir = path.resolve(__dirname, '.');

class Logger {

  logMessages = [];

  concatMessages(...messages) {
    let msg = '';
    for (let i=0; i<messages.length; i++) {
      if (typeof messages[i] === 'string' || messages[i] instanceof String) {
        msg += messages[i];
      } else {
        msg += JSON.stringify(messages[i]);
      }
      msg += ' ';
    }
    return msg;
  }

  infoAndPrint(...messages) {
    this.info(...messages);
    console.log(this.concatMessages(...messages));
  }

  info(...messages) {
    const message = 'INFO: ' + this.concatMessages(...messages);
    this.logMessages.push({
      time: new Date().toISOString(),
      message: message
    });
  }

  debug(...messages) {
    const message = 'DEBUG: ' + this.concatMessages(...messages);
    this.logMessages.push({
      time: new Date().toISOString(),
      message: message
    });
  }

  warn(...messages) {
    const message = 'WARN: ' + this.concatMessages(...messages);
    this.logMessages.push({
      time: new Date().toISOString(),
      message: message
    });
  }

  error(...messages) {
    const message = 'ERROR: ' + this.concatMessages(...messages);
    this.logMessages.push({
      time: new Date().toISOString(),
      message: message
    });
  }
}

class EufyPlatform {

  eufyClient = null;
  config = null;
  refreshTimeout = null;

  stations = [];
  devices = [];

  log = null;
  eufyLibraryLog = null;

  constructor(config) {
    this.log = new Logger();
    this.eufyLibraryLog = new Logger();
    this.log.infoAndPrint('Initializing...');

    this.config = config;
  }

  async connect() {

    const logLib = bunyan.createLogger({
      name: 'eufy-test-client]',
      hostname: '',
      streams: [{
        level: 'debug',
        type: 'rotating-file',
        count: 3,
        path: 'eufy-security-client.log',
      }],
    });

    this.eufyClient = await EufySecurity.initialize(this.config, logLib);

    this.connectLoginHandlers();

    try {
      await this.eufyClient.connect();
      this.log.info('EufyClient connected ' + this.eufyClient.isConnected());
    } catch (err) {
      this.log.infoAndPrint('Error authenticating Eufy : ' + err);
    }

    if (!this.eufyClient.isConnected()) {
      this.log.infoAndPrint('Not connected can\'t continue! Maybe wrong credentials or captcha or 2FA.');
    }
  }

  connectLoginHandlers() {
    this.eufyClient.on('tfa request', () => this.onTFARequest());
    this.eufyClient.on('captcha request', (id, captcha) => this.onCaptchaRequest(id, captcha));
    this.eufyClient.on('connect', async () => {
      this.log.infoAndPrint('Event: connect')
      this.connectEventHandlers();

      await this.updateDevices();

      this.actionMainMenu();
    });
  }

  connectEventHandlers() {
    this.eufyClient.on('device added', (device) => this.onDeviceAdded(device));
    this.eufyClient.on('device removed', (device) => this.log.info('Event: Device ' + device.getName() + ' removed.'));
    this.eufyClient.on('device property changed', (device, name, value) => this.log.info('Event: Device' + device.getName() + ' property: ' + name + ' changed to: ' + value));
    this.eufyClient.on('device raw property changed', (device, type, value) => this.log.info('Event: Device' + device.getName() + ' raw property: ' + type + ' changed to: ' + value));
    this.eufyClient.on('device crying detected', (device, state) => this.log.info('Event: Device' + device.getName() + ' crying detected: ' + state));
    this.eufyClient.on('device sound detected', (device, state) => this.log.info('Event: Device' + device.getName() + ' sound detected: ' + state));
    this.eufyClient.on('device pet detected', (device, state) => this.log.info('Event: Device' + device.getName() + ' pet detected: ' + state));
    this.eufyClient.on('device motion detected', (device, state) => this.log.info('Event: Device' + device.getName() + ' motion detected: ' + state));
    this.eufyClient.on('device person detected', (device, state) => this.log.info('Event: Device' + device.getName() + ' person detected: ' + state));
    this.eufyClient.on('device rings', (device, state) => this.log.info('Event: Device' + device.getName() + ' rings: ' + state));
    this.eufyClient.on('device locked', (device, state) => this.log.info('Event: Device' + device.getName() + ' locked: ' + state));
    this.eufyClient.on('device open', (device, state) => this.log.info('Event: Device' + device.getName() + ' open: ' + state));
    this.eufyClient.on('station added', (station) => this.onStationAdded(station));
    this.eufyClient.on('station removed', (station) => this.log.info('Event: Station ' + station.getName() + ' removed.'));
    this.eufyClient.on('station livestream start', (station, device) => this.log.info('Event: Station ' + station.getName() + ' livestream start from ' + device.getName()));
    this.eufyClient.on('station livestream stop', (station, device) => this.log.info('Event: Station ' + station.getName() + ' livestream stop from ' + device.getName()));
    this.eufyClient.on('station download start', (station, device) => this.log.info('Event: Station ' + station.getName() + ' download start from ' + device.getName()));
    this.eufyClient.on('station download finish', (station, device) => this.log.info('Event: Station ' + station.getName() + ' download finish from ' + device.getName()));
    this.eufyClient.on('station command result', (station,result) => this.log.info('Event: Station ' + station.getName() + ' command result: ' + JSON.stringify(result)));
    this.eufyClient.on('station rtsp livestream start', (station, device) => this.log.info('Event: Station ' + station.getName() + ' rtsp livestream start from ' + device.getName()));
    this.eufyClient.on('station rtsp livestream stop', (station, device) => this.log.info('Event: Station ' + station.getName() + ' rtsp livestream stop from ' + device.getName()));
    this.eufyClient.on('station rtsp url', (station, device, url) => this.log.info('Event: Station ' + station.getName() + ' rtsp url from ' + device.getName() + ': ' + url));
    this.eufyClient.on('station guard mode', (station, value) => this.log.info('Event: Station ' + station.getName() + ' guard mode: ' + value));
    this.eufyClient.on('station current mode', (station, value) => this.log.info('Event: Station ' + station.getName() + ' current mode: ' + value));
    this.eufyClient.on('station property changed', (station, name, value) => this.log.info('Event: Station' + station.getName() + ' property: ' + name + ' changed to: ' + value));
    this.eufyClient.on('station raw property changed', (station, type, value) => this.log.info('Event: Station' + station.getName() + ' raw property: ' + type + ' changed to: ' + value));
    this.eufyClient.on('station alarm event', (station, event) => this.log.info('Event: Station ' + station.getName() + ' alarm event: ' + event));
    this.eufyClient.on('station connect', (station) => this.log.info('Event: Station ' + station.getName() + ' connect'));
    this.eufyClient.on('station close', (station) => this.log.info('Event: Station ' + station.getName() + ' close'));
    this.eufyClient.on('station talkback start', (station, device, stream) => this.onStationTalkbackStart(station, device, stream));
    this.eufyClient.on('station talkback stop', (station, device) => this.onStationTalkbackStop(station, device));
    this.eufyClient.on('push connect', () => this.log.info('Event: push connect'));
    this.eufyClient.on('push close', () => this.log.info('Event: push close'));
    this.eufyClient.on('push message', (message) => this.log.info('Event: push message: ' + JSON.stringify(message)));
    this.eufyClient.on('close', () => this.log.info('Event: close'));
    this.eufyClient.on('cloud livestream start', (station, device, url) => this.log.info('Event: Station ' + station.getName() + ' cloud livestream start from ' + device.getName() + ' - url: ' + url));
    this.eufyClient.on('cloud livestream stop', (station, device) => this.log.info('Event: Station ' + station.getName() + ' cloud livestream stop from ' + device.getName()));
    this.eufyClient.on('mqtt connect', () => this.log.info('Event: mqtt connect'));
    this.eufyClient.on('mqtt close', () => this.log.info('Event: mqtt close'));
    this.eufyClient.on('mqtt lock message', (message) => this.log.info('Event: mqtt message: ' + JSON.stringify(message)));
  }

  onDeviceAdded(device) {
    this.log.info('Event: Device ' + device.getName() + ' added.');
    this.updateDevices();
  }

  onStationAdded(station) {
    this.log.info('Event: Station ' + station.getName() + ' added.');
    this.updateDevices();
  }

  onTFARequest() {
    this.log.info('Event: 2FA request');
    readline.question('You should have gotten a OTP Code via mail from eufy. Please enter this code:', async (code) => {
      try {
        await this.eufyClient.connect({
          verifyCode: code,
        });
        this.log.infoAndPrint('EufyClient connected ' + this.eufyClient.isConnected());
      } catch (err) {
        this.log.infoAndPrint('Error authenticating Eufy : ' + err);
      }
  
      if (!this.eufyClient.isConnected()) {
        this.log.infoAndPrint('Not connected can\'t continue! Maybe wrong credentials or captcha or 2FA.');
        return;
      }
    });
  }

  onCaptchaRequest(id, captcha) {
    this.log.info('Event: captcha request');
    this.log.infoAndPrint('Got Captcha. View it under: ' + captcha);
    readline.question('Please enter the captcha text: ', async (captchaCode) => {
      try {
        await this.eufyClient.connect({
          captcha: {
            captchaCode: captchaCode,
            captchaId: id,
          }
        });
        this.log.infoAndPrint('EufyClient connected ' + this.eufyClient.isConnected());
      } catch (err) {
        this.log.infoAndPrint('Error authenticating Eufy : ' + err);
      }
  
      if (!this.eufyClient.isConnected()) {
        this.log.infoAndPrint('Not connected can\'t continue! Maybe wrong credentials or captcha or 2FA.');
        return;
      }
    });
  }

  showLog() {
    console.clear();
    this.log.logMessages.forEach((msg) => {
      console.log(msg.time + ' - ' + msg.message);
    });
    readline.question('Type \'save\' to write log to file in your current working directory or hit Enter to go back:  ', (text) => {
      if (text == 'save') {
        const filename = 'log_' + Date.now() + '.txt';
        this.log.infoAndPrint('Writing log messages to file ' + filename + '...');
        try {
          const file = fs.createWriteStream(filename, { flags: 'w' });
          file.setDefaultEncoding('utf8');
          this.log.logMessages.forEach((msg) => {
            file.write(msg.time + ' - ' + msg.message + '\n');
          });
          this.log.info('File written');
          file.close();
        } catch (err) {
          this.log.info('File could not be written. Maybe check permissions!');
        }
        this.showLog();
        return;
      }
      this.actionMainMenu();
    });
  }

  async saveEufyLog() {
    console.clear();
    const filename = 'eufy-security-client_log_' + Date.now() + '.txt';
    this.log.infoAndPrint('Writing log messages to file ' + filename + '...');
    try {
      const file = fs.createWriteStream(filename, { flags: 'w' });
      file.setDefaultEncoding('utf8');
      this.eufyLibraryLog.logMessages.forEach((msg) => {
        file.write(msg.time + ' - ' + msg.message + '\n');
      });
      this.log.infoAndPrint('File written');
      file.close();
    } catch (err) {
      this.log.infoAndPrint('File could not be written. Maybe check permissions!');
    }

    await this.waitForEnterKeystroke();
    this.actionMainMenu();
  }

  async updateDevices() {
    this.log.info('Updating station and device list.');
    const eufyStations = await this.eufyClient.getStations();
    this.log.info('Found ' + eufyStations.length + ' stations.');

    for (const station of eufyStations) {
      this.log.info(
        'Found Station',
        station.getSerial(),
        station.getName(),
        station.getLANIPAddress(),
      );

      this.addStation(station);
    }

    const eufyDevices = await this.eufyClient.getDevices();
    this.log.info('Found ' + eufyDevices.length + ' devices.');

    for (const device of eufyDevices) {
      this.log.info(
        'Found device',
        device.getSerial(),
        device.getName(),
      );
      this.addDevice(device);
    }
  }

  addDevice(device) {
    let exists = false;
    this.devices.forEach((d) => { if (d.getSerial() === device.getSerial()) exists = true; });
    if (!exists) this.devices.push(device);
  }

  addStation(station) {
    let exists = false;
    this.stations.forEach((s) => { if (s.getSerial() === station.getSerial()) exists = true; });
    if (!exists) this.stations.push(station);
  }

  async close() {
    console.log('Shutting down...');
    if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
    this.eufyClient.once('close', () => {
      console.log('Finished shutdown!');
      process.exit();
    });
    await this.eufyClient.close();
    setTimeout(() => {
      process.exit();
    }, 10000);
  }

  getMenuChoice(choice) {
    var value = parseInt(choice);
    if (isNaN(value)) return null;
    return value;
  }

  actionMainMenu() {
    this.log.info('Enter Main menu.');
    console.clear();
    console.log('Main menu: \n');
    console.log('1. Select Stations');
    console.log('2. Select Devices');
    console.log('3. Settings');
    console.log('4. Show log');
    console.log('5. Exit');

    readline.question('Choice?   ', choice => {

      var value = this.getMenuChoice(choice);
      switch (value) {
        case 1:
          this.actionStationsMenu();
        break;
        case 2:
          this.actionDevicesMenu();
        break;
        case 3:
          this.actionSettingsMenu();
        break;
        case 4:
          this.showLog();
        break;
        case 5:
          this.close();
        break;
        default:
          this.actionMainMenu();
          break;
      }

    });
  }

  async actionStationsMenu() {
    this.log.info('Enter stations menu.')

    if (this.stations.length == 0) {
      this.log.infoAndPrint('There were no stations found!');
      
      await this.waitForEnterKeystroke();
      this.actionMainMenu();
      return;
    }

    console.clear();
    console.log('List of stations: \n');
    var counter = 0;
    this.stations.forEach((station) => {
      counter++;
      console.log(counter + '. ' + station.getName());
    });
    counter++;
    console.log(counter + '. Back');

    readline.question('Choice?   ', choice => {

      var value = this.getMenuChoice(choice);
      if (!value || value < 1 || value > counter) {
        this.actionStationsMenu();
        return;
      }

      if (value == counter) {
        this.actionMainMenu();
        return;
      }

      this.actionStationMenu(value-1);

    });
  }

  actionStationMenu(station) {
    this.log.info('enter selected station ' + this.stations[station].getName() + ' menu');
    
    console.clear();
    console.log(this.stations[station].getName() + ' menu:\n');
    console.log('1. Change guard mode');
    console.log('2. Trigger alarm');
    console.log('3. Reset alarm');
    console.log('4. Main Menu');

    readline.question('Choice?   ', choice => {

      var value = this.getMenuChoice(choice);
      switch (value) {
        case 1:
          this.actionGuardModeMenu(station);
        break;
        case 2:
          this.actionTriggerStationAlarm(station);
        break;
        case 3:
          this.actionResetStationAlarm(station);
        break;
        case 4:
          this.actionMainMenu();
        break;
        default:
          this.actionStationMenu(station);
          break;
      }

    });
  }

  async actionGuardModeMenu(station) {
    this.log.info('enter guard mode menu for station ' + this.stations[station].getName());

    const modes = [
      {
        id: 0,
        name: 'AWAY'
      },
      {
        id: 1,
        name: 'HOME'
      },
      {
        id: 63,
        name: 'DISARMED'
      },
      {
        id: 6,
        name: 'OFF'
      },
      {
        id: 3,
        name: 'CUSTOM1 / NIGHT'
      },
      {
        id: 2,
        name: 'SCHEDULE'
      },
      {
        id: 47,
        name: 'GEO'
      },
      {
        id: 4,
        name: 'CUSTOM2'
      },
      {
        id: 5,
        name: 'CUSTOM3'
      }
    ];

    const currentMode = modes.filter((m) => { return m.id == this.stations[station].getCurrentMode() })[0];
    const guardMode = modes.filter((m) => { return m.id == this.stations[station].getGuardMode() })[0];

    console.clear();
    console.log(this.stations[station].getName());
    console.log('Current mode: ' + ((currentMode) ? '(' + currentMode.id + ') ' + currentMode.name : 'UNKNOWN'));
    console.log('Guard mode: ' + ((guardMode) ? '(' + guardMode.id + ') ' + guardMode.name : 'UNKNOWN'));
    console.log('\n');
    console.log('Hit Enter to go back to the main menu. For changing the guard mode type the corresponding number. E.g. you can try the following:');
    console.log('0: AWAY - 1: HOME - 3: CUSTOM1/NIGHT - 6: OFF - 63: DISARMED');
    console.log('Depending on your hardware different modes can be avaiable.\n');

    readline.question('Choice?   ', async choice => {

      if (choice == '') {
        this.actionMainMenu();
        return;
      }

      var value = this.getMenuChoice(choice);
      if (value === null) {
        this.actionGuardModeMenu(station);
        return;
      }

      const mode = modes.filter((m) => { return m.id == value });
      if (mode.length == 0) {
        this.log.infoAndPrint('Value of ' + value + ' doesn\'t seem to map to a regognized guard mode. Trying anyway...');
      } else {
        this.log.infoAndPrint('Trying to set guard mode to (' + mode[0].id + ') ' + mode[0].name);
      }

      try {
        await this.stations[station].setGuardMode(value);
      } catch (err) {
        this.log.infoAndPrint('An error occured: ' + err);
      }


      this.log.infoAndPrint('Command executed.');
      
      await this.waitForEnterKeystroke();
      this.actionMainMenu();
    });
  }

  async actionTriggerStationAlarm(station) {
    console.clear();
    this.log.info('trigger station alarm for station ' + station);

    readline.question('How long (in seconds)? ', async choice => {

      var value = this.getMenuChoice(choice);
      if (!value || value < 0) {
        this.log.infoAndPrint('No valid value!');
        await this.waitForEnterKeystroke();
        this.actionStationMenu(station);
        return;
      }

      this.log.info('alarm for ' + value + ' seconds');
      this.stations[station].triggerStationAlarmSound(value);

      await this.waitForEnterKeystroke();
      this.actionStationMenu(station);
    });
  }

  async actionResetStationAlarm(station) {
    console.clear();
    this.log.infoAndPrint('Reset station alarm for station ' + station);

    this.stations[station].resetStationAlarmSound();

    await this.waitForEnterKeystroke();
    this.actionStationMenu(station);
  }

  async actionDevicesMenu() {
    this.log.info('Enter devices menu.')

    if (this.devices.length == 0) {
      this.log.infoAndPrint('There were no devices found!');
      await this.waitForEnterKeystroke();
      this.actionMainMenu();
      return;
    }

    console.clear();
    console.log('List of devices: \n');
    var counter = 0;
    this.devices.forEach((device) => {
      counter++;
      console.log(counter + '. ' + device.getName());
    });
    counter++;
    console.log(counter + '. Back');

    readline.question('Choice?   ', choice => {

      var value = this.getMenuChoice(choice);
      if (!value || value < 1 || value > counter) {
        this.actionDevicesMenu();
        return;
      }

      if (value == counter) {
        this.actionMainMenu();
        return;
      }

      this.actionDeviceMenu(value-1);

    });
  }

  actionDeviceMenu(device) {
    this.log.info('enter selected device ' + this.devices[device].getName() + ' menu (type: ' + this.devices[device].getDeviceType() + ')');
    
    console.clear();
    console.log(this.devices[device].getName() + ' menu:\n');
    console.log('1. Start P2P Livestream');
    console.log('2. Stop P2P Livestream');
    console.log('3. Start Talkback');
    console.log('4. Stop Talkback');
    console.log('5. Start Cloud Livestream');
    console.log('6. Stop Cloud Livestream');
    console.log('7. Get RTSP Capabilities');
    console.log('8. Main Menu');

    readline.question('Choice?   ', choice => {

      var value = this.getMenuChoice(choice);
      switch (value) {
        case 1:
          this.actionLivestreamStart(device);
        break;
        case 2:
          this.actionLivestreamStop(device);
        break;
        case 3:
          this.actionTalkbackStart(device);
        break;
        case 4:
          this.actionTalkbackStop(device);
        break;
        case 5:
          this.actionCloudLivestreamStart(device);
        break;
        case 6:
          this.actionCloudLivestreamStop(device);
        break;
        case 7:
          this.actionGetRTSPProperties(device);
        break;
        case 8:
          this.actionMainMenu();
        break;
        default:
          this.actionDeviceMenu(device);
          break;
      }

    });
  }

  async actionLivestreamStart(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log.infoAndPrint('Start p2p livestream on ' + device.getName() + '...');

    try {
      await this.eufyClient.startStationLivestream(device.getSerial());
    } catch (err) {
      this.log.infoAndPrint('Could not start talkback: ' + err);
    }

    await this.waitForEnterKeystroke();
    this.actionDeviceMenu(deviceId);
  }

  async actionLivestreamStop(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log.infoAndPrint('Stop p2p livestream on ' + device.getName() + '...');

    try {
      await this.eufyClient.stopStationLivestream(device.getSerial());
    } catch (err) {
      this.log.infoAndPrint('Could not start talkback: ' + err);
    }

    await this.waitForEnterKeystroke();
    this.actionDeviceMenu(deviceId);
  }

  async actionTalkbackStart(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log.infoAndPrint('Start talkback feature on ' + device.getName() + '...');

    try {
      await this.eufyClient.startStationTalkback(device.getSerial());
    } catch (err) {
      this.log.infoAndPrint('Could not start talkback: ' + err);
    }

    await this.waitForEnterKeystroke();
    this.actionDeviceMenu(deviceId);
  }

  onStationTalkbackStart(station, device, stream) {
    this.log.infoAndPrint('Event: Talkback started from ' + device.getName() + ' on station ' + station.getName());

    const args = '-re -i ' + mp3Path + ' ' +
                 '-acodec aac ' +
                 '-ac 1 ' +
                 '-ar 16k ' +
                 '-b:a 16k ' +
                 '-f adts pipe:1';
    
    const ffmpeg = spawn(ffmpegPath, args.split(/\s+/), { env: process.env });

    ffmpeg.stdout.pipe(stream);

    ffmpeg.on('error', (err) => {
      this.log.info('FFMpeg error: ' + err);
    });
    ffmpeg.stderr.on('data', (data) => {
      data.toString().split('\n').forEach((line) => {
        if (line.length > 0) {
          this.log.info(line);
        }
      });
    });
    ffmpeg.on('close', () => {
      this.log.info('ffmpeg closed.');
    });
  }

  async actionTalkbackStop(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log.infoAndPrint('Stop talkback feature on ' + device.getName() + '...');

    try {
      await this.eufyClient.stopStationTalkback(device.getSerial());
    } catch (err) {
      this.log.infoAndPrint('Could not stop talkback: ' + err);
    }

    await this.waitForEnterKeystroke();
    this.actionDeviceMenu(deviceId);
  }

  onStationTalkbackStop(station, device) {
    this.log.infoAndPrint('Event: Talkback stopped from ' + device.getName() + ' on station ' + station.getName());
  }

  async actionCloudLivestreamStart(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log.infoAndPrint('Starting cloud livestream for ' + device.getName() + '...');
    try {
      this.eufyClient.startCloudLivestream(device.getSerial());
    } catch (err) {
      this.log.error('Could not start cloud livestream: ' + err);
      console.log('Cloud livestream did not start due to error.');
    }
    await this.waitForEnterKeystroke();
    this.actionDeviceMenu(deviceId);
  }

  async actionCloudLivestreamStop(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log.infoAndPrint('Stopping cloud livestream for ' + device.getName() + '...');
    try {
      this.eufyClient.stopCloudLivestream(device.getSerial());
    } catch (err) {
      this.log.error('Could not stop cloud livestream: ' + err);
      console.log('Cloud livestream did not stop due to error.');
    }
    await this.waitForEnterKeystroke();
    this.actionDeviceMenu(deviceId);
  }

  async actionGetRTSPProperties(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log.infoAndPrint('Getting RTSP capabilities for ' + device.getName());
    const hasProperty = (device.hasProperty('rtspStream'));
    this.log.infoAndPrint('Device has RTSP property: ' + hasProperty);
    const enabledProperty = (device.getPropertyValue(PropertyName.DeviceRTSPStream));
    const url = (device.getPropertyValue(PropertyName.DeviceRTSPStreamUrl));
    this.log.infoAndPrint('Device RTSP enabled: ' + enabledProperty);
    this.log.infoAndPrint('Device RTSP url: ' + url);

    await this.waitForEnterKeystroke();
    this.actionDeviceMenu(deviceId);
  }

  actionSettingsMenu() {
    this.log.info('Enter settings menu.')

    console.clear();
    console.log('Settings: \n');
    console.log('1. Set maximum livestream duration')
    console.log('2. Back');

    readline.question('Choice?   ', choice => {

      var value = this.getMenuChoice(choice);
      if (!value || value < 1 || value > 2) {
        this.actionSettingsMenu();
        return;
      }

      switch (value) {
        case 1:
          this.actionMaxLivestreamDuration();
        break;
        case 2:
          this.actionMainMenu();
        break;
        default:
          this.actionSettingsMenu();
        break;
      }

    });
  }

  async actionMaxLivestreamDuration() {
    this.log.info('Set maximum livestream duration');

    console.clear();

    readline.question('Enter maximum duration for livestreams (in seconds): ', async choice => {
      var value = this.getMenuChoice(choice);
      if(!value || value < 1) {
        this.log.infoAndPrint('No valid value entered!');
        await this.waitForEnterKeystroke();
        this.actionSettingsMenu();
        return;
      }

      this.eufyClient.setCameraMaxLivestreamDuration(value);
      this.log.infoAndPrint('Set ' + value + ' seconds as maximum livestream duration.');
      await this.waitForEnterKeystroke();
      this.actionSettingsMenu();
    });
  }

  getStation(serial) {
    this.log.info('Trying to find station with serial ' + serial);
    for (var i=0; i<this.stations.length; i++) {
      if (this.stations[i].getSerial() == serial) return this.stations[i];
    }

    return null;
  }

  waitForEnterKeystroke() {
    return new Promise((resolve, reject) => {
      readline.question('', (choice) => {
        resolve();
      });
    })
  }

  async notImplementedYet() {
    this.log.infoAndPrint('Not implemented yet!');
    await this.waitForEnterKeystroke();
    this.actionMainMenu();
  }
}

async function main_loop() {
  const platform = new EufyPlatform(config);
  await platform.connect();
};

main_loop();
