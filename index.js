const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const fs = require('fs');
const { spawn } = require('child_process');

const { EufySecurity } = require('eufy-security-client');
const ffmpegPath = require('ffmpeg-for-homebridge');

const mp3Path = require.resolve('./sample.mp3');

const { config } = require('./config');

if (config.username == '*****' || config.password == '*****') {
  console.log('You have to specify login credentials in ./config.js');
  process.exit();
}

class EufyPlatform {

  eufyClient = null;
  config = null;
  refreshTimeout = null;

  logMessages = [];

  stations = [];
  devices = [];

  constructor(config) {
    this.log('Initializing...', true);

    this.config = config;
  }

  async connect() {
    this.eufyClient = await EufySecurity.initialize(this.config);

    this.connectLoginHandlers();

    try {
      await this.eufyClient.connect();
      this.log('EufyClient connected ' + this.eufyClient.isConnected());
    } catch (err) {
      this.log('Error authenticating Eufy : ' + err, true);
    }

    if (!this.eufyClient.isConnected()) {
      this.log('Not connected can\'t continue! Maybe wrong credentials or captcha or 2FA.', true);
    }
  }

  async refreshData(client) {
    this.log(
      `PollingInterval: 10 minutes`
    );
    if (client) {
      this.log('Refresh data from cloud and schedule next refresh.');
      try {
        await client.refreshCloudData();
      } catch (error) {
        this.log('Error refreshing data from Eufy: ', error);
      }
      this.refreshTimeout = setTimeout(() => {
        try {
          this.refreshData(client);
        } catch (error) {
          this.log('Error refreshing data from Eufy: ', error);
        }
      }, 10 * 60 * 1000);
    }
  }

  connectLoginHandlers() {
    this.eufyClient.on('tfa request', () => this.onTFARequest());
    this.eufyClient.on('captcha request', (id, captcha) => this.onCaptchaRequest(id, captcha));
    this.eufyClient.on('connect', async () => {
      this.log('Event: connect', true)
      this.connectEventHandlers();

      await this.refreshData(this.eufyClient);
      await this.updateDevices();

      this.actionMainMenu();
    });
  }

  connectEventHandlers() {
    this.eufyClient.on('device added', (device) => this.log('Event: Device ' + device.getName() + ' added.'));
    this.eufyClient.on('device removed', (device) => this.log('Event: Device ' + device.getName() + ' removed.'));
    this.eufyClient.on('device property changed', (device, name, value) => this.log('Event: Device' + device.getName() + ' property: ' + name + ' changed to: ' + value));
    this.eufyClient.on('device raw property changed', (device, type, value) => this.log('Event: Device' + device.getName() + ' raw property: ' + type + ' changed to: ' + value));
    this.eufyClient.on('device crying detected', (device, state) => this.log('Event: Device' + device.getName() + ' crying detected: ' + state));
    this.eufyClient.on('device sound detected', (device, state) => this.log('Event: Device' + device.getName() + ' sound detected: ' + state));
    this.eufyClient.on('device pet detected', (device, state) => this.log('Event: Device' + device.getName() + ' pet detected: ' + state));
    this.eufyClient.on('device motion detected', (device, state) => this.log('Event: Device' + device.getName() + ' motion detected: ' + state));
    this.eufyClient.on('device person detected', (device, state) => this.log('Event: Device' + device.getName() + ' person detected: ' + state));
    this.eufyClient.on('device rings', (device, state) => this.log('Event: Device' + device.getName() + ' rings: ' + state));
    this.eufyClient.on('device locked', (device, state) => this.log('Event: Device' + device.getName() + ' locked: ' + state));
    this.eufyClient.on('device open', (device, state) => this.log('Event: Device' + device.getName() + ' open: ' + state));
    this.eufyClient.on('station added', (station) => this.log('Event: Station ' + station.getName() + ' added.'));
    this.eufyClient.on('station removed', (station) => this.log('Event: Station ' + station.getName() + ' removed.'));
    this.eufyClient.on('station livestream start', (station, device) => this.log('Event: Station ' + station.getName() + ' livestream start from ' + device.getName()));
    this.eufyClient.on('station livestream stop', (station, device) => this.log('Event: Station ' + station.getName() + ' livestream stop from ' + device.getName()));
    this.eufyClient.on('station download start', (station, device) => this.log('Event: Station ' + station.getName() + ' download start from ' + device.getName()));
    this.eufyClient.on('station download finish', (station, device) => this.log('Event: Station ' + station.getName() + ' download finish from ' + device.getName()));
    this.eufyClient.on('station command result', (station,result) => this.log('Event: Station ' + station.getName() + ' command result: ' + JSON.stringify(result)));
    this.eufyClient.on('station rtsp livestream start', (station, device) => this.log('Event: Station ' + station.getName() + ' rtsp livestream start from ' + device.getName()));
    this.eufyClient.on('station rtsp livestream stop', (station, device) => this.log('Event: Station ' + station.getName() + ' rtsp livestream stop from ' + device.getName()));
    this.eufyClient.on('station rtsp url', (station, device, url) => this.log('Event: Station ' + station.getName() + ' rtsp url from ' + device.getName() + ': ' + url));
    this.eufyClient.on('station guard mode', (station, value) => this.log('Event: Station ' + station.getName() + ' guard mode: ' + value));
    this.eufyClient.on('station current mode', (station, value) => this.log('Event: Station ' + station.getName() + ' current mode: ' + value));
    this.eufyClient.on('station property changed', (station, name, value) => this.log('Event: Station' + station.getName() + ' property: ' + name + ' changed to: ' + value));
    this.eufyClient.on('station raw property changed', (station, type, value) => this.log('Event: Station' + station.getName() + ' raw property: ' + type + ' changed to: ' + value));
    this.eufyClient.on('station alarm event', (station, event) => this.log('Event: Station ' + station.getName() + ' alarm event: ' + event));
    this.eufyClient.on('station connect', (station) => this.log('Event: Station ' + station.getName() + ' connect'));
    this.eufyClient.on('station close', (station) => this.log('Event: Station ' + station.getName() + ' close'));
    this.eufyClient.on('station talkback start', (station, device, stream) => this.onStationTalkbackStart(station, device, stream));
    this.eufyClient.on('station talkback stop', (station, device) => this.onStationTalkbackStop(station, device));
    this.eufyClient.on('push connect', () => this.log('Event: push connect'));
    this.eufyClient.on('push close', () => this.log('Event: push close'));
    this.eufyClient.on('push message', (message) => this.log('Event: push message: ' + JSON.stringify(message)));
    this.eufyClient.on('close', () => this.log('Event: close'));
    this.eufyClient.on('cloud livestream start', (station, device, url) => this.log('Event: Station ' + station.getName() + ' cloud livestream start from ' + device.getName() + ' - url: ' + url));
    this.eufyClient.on('cloud livestream stop', (station, device) => this.log('Event: Station ' + station.getName() + ' cloud livestream stop from ' + device.getName()));
    this.eufyClient.on('mqtt connect', () => this.log('Event: mqtt connect'));
    this.eufyClient.on('mqtt close', () => this.log('Event: mqtt close'));
    this.eufyClient.on('mqtt lock message', (message) => this.log('Event: mqtt message: ' + JSON.stringify(message)));
  }

  onTFARequest() {
    this.log('Event: 2FA request');
    readline.question('You should have gotten a OTP Code via mail from eufy. Please enter this code:', async (code) => {
      try {
        await this.eufyClient.connect({
          verifyCode: code,
        });
        this.log('EufyClient connected ' + this.eufyClient.isConnected(), true);
      } catch (err) {
        this.log('Error authenticating Eufy : ' + err, true);
      }
  
      if (!this.eufyClient.isConnected()) {
        this.log('Not connected can\'t continue! Maybe wrong credentials or captcha or 2FA.', true);
        return;
      }
    });
  }

  onCaptchaRequest(id, captcha) {
    this.log('Event: captcha request');
    this.log('Got Captcha. View it under: ' + captcha, true);
    readline.question('Please enter the captcha text: ', async (captchaCode) => {
      try {
        await this.eufyClient.connect({
          captcha: {
            captchaCode: captchaCode,
            captchaId: id,
          }
        });
        this.log('EufyClient connected ' + this.eufyClient.isConnected(), true);
      } catch (err) {
        this.log('Error authenticating Eufy : ' + err, true);
      }
  
      if (!this.eufyClient.isConnected()) {
        this.log('Not connected can\'t continue! Maybe wrong credentials or captcha or 2FA.', true);
        return;
      }
    });
  }

  log(message, output) {
    this.logMessages.push({
      time: new Date().toISOString(),
      message: message
    });
    if (output) console.log(message);
  }

  showLog() {
    console.clear();
    this.logMessages.forEach((msg) => {
      console.log(msg.time + ' - ' + msg.message);
    });
    readline.question('Type \'save\' to write log to file in your current working directory or hit Enter to go back:  ', (text) => {
      if (text == 'save') {
        const filename = 'eufylog_' + Date.now() + '.txt';
        this.log('Writing log messages to file ' + filename + '...', true);
        try {
          const file = fs.createWriteStream(filename, { flags: 'w' });
          file.setDefaultEncoding('utf8');
          this.logMessages.forEach((msg) => {
            file.write(msg.time + ' - ' + msg.message + '\n');
          });
          this.log('File written');
          file.close();
        } catch (err) {
          this.log('File could not be written. Maybe check permissions!');
        }
        this.showLog();
        return;
      }
      this.actionMainMenu();
    });
  }

  async updateDevices() {
    this.log('Updating station and device list.');
    const eufyStations = await this.eufyClient.getStations();
    this.log('Found ' + eufyStations.length + ' stations.');

    for (const station of eufyStations) {
      this.log(
        'Found Station',
        station.getSerial(),
        station.getName(),
        station.getLANIPAddress(),
      );

      this.stations.push(station);
    }

    const eufyDevices = await this.eufyClient.getDevices();
    this.log('Found ' + eufyDevices.length + ' devices.');

    for (const device of eufyDevices) {
      console.log(
        'Found device',
        device.getSerial(),
        device.getName(),
      );
      this.devices.push(device);
    }
  }

  async close() {
    if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
    await this.eufyClient.close();
    process.exit();
  }

  getMenuChoice(choice) {
    var value = parseInt(choice);
    if (isNaN(value)) return null;
    return value;
  }

  actionMainMenu() {
    this.log('Enter Main menu.');
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

  actionStationsMenu() {
    this.log('Enter stations menu.')

    if (this.stations.length == 0) {
      this.log('There were no stations found! Going back...', true);
      setTimeout(() => {
        this.actionMainMenu();
      }, 4000);
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
    this.log('enter selected station ' + this.stations[station].getName() + ' menu');
    
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

  actionGuardModeMenu(station) {
    this.log('enter guard mode menu for station ' + this.stations[station].getName());

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
        this.log('Value of ' + value + ' doesn\'t seem to map to a regognized guard mode. Trying anyway...', true);
      } else {
        this.log('Trying to set guard mode to (' + mode[0].id + ') ' + mode[0].name, true);
      }

      try {
        await this.stations[station].setGuardMode(value);
      } catch (err) {
        this.log('An error occured: ' + err, true);
      }


      this.log('Command executed. Returning to main menu...', true);
      setTimeout(() => {
        this.actionMainMenu();
      }, 5000);

    });
  }

  actionTriggerStationAlarm(station) {
    console.clear();
    this.log('trigger station alarm for station ' + station);

    readline.question('How long (in seconds)? ', choice => {

      var value = this.getMenuChoice(choice);
      if (!value || value < 0) {
        this.log('No valid value!', true);
        setTimeout(() => {
          this.actionStationMenu(station);
        }, 4000);
        return;
      }

      this.log('alarm for ' + value + ' seconds');
      this.stations[station].triggerStationAlarmSound(value);

      setTimeout(() => {
        this.actionStationMenu(station);
      }, 2000);
    });
  }

  actionResetStationAlarm(station) {
    console.clear();
    this.log('Reset station alarm for station ' + station, true);

    this.stations[station].resetStationAlarmSound();

    setTimeout(() => {
      this.actionStationMenu(station);
    }, 4000);
  }

  actionDevicesMenu() {
    this.log('Enter devices menu.')

    if (this.devices.length == 0) {
      this.log('There were no devices found! Going back...', true);
      setTimeout(() => {
        this.actionMainMenu();
      }, 4000);
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
    this.log('enter selected device ' + this.devices[device].getName() + ' menu (type: ' + this.devices[device].getDeviceType() + ')');
    
    console.clear();
    console.log(this.devices[device].getName() + ' menu:\n');
    console.log('1. Start P2P Livestream');
    console.log('2. Stop P2P Livestream');
    console.log('3. Start Talkback');
    console.log('4. Stop Talkback');
    console.log('5. Main Menu');

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
    this.log('Start p2p livestream on ' + device.getName() + '...', true);

    try {
      await this.eufyClient.startStationLivestream(device.getSerial());
    } catch (err) {
      this.log('Could not start talkback: ' + err, true);
    }

    setTimeout(() => {
      this.actionDeviceMenu(deviceId);
    }, 1000);
  }

  async actionLivestreamStop(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log('Stop p2p livestream on ' + device.getName() + '...', true);

    try {
      await this.eufyClient.stopStationLivestream(device.getSerial());
    } catch (err) {
      this.log('Could not start talkback: ' + err, true);
    }

    setTimeout(() => {
      this.actionDeviceMenu(deviceId);
    }, 1000);
  }

  async actionTalkbackStart(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log('Start talkback feature on ' + device.getName() + '...', true);

    try {
      await this.eufyClient.startStationTalkback(device.getSerial());
    } catch (err) {
      this.log('Could not start talkback: ' + err, true);
    }

    setTimeout(() => {
      this.actionDeviceMenu(deviceId);
    }, 5000);
  }

  onStationTalkbackStart(station, device, stream) {
    this.log('Event: Talkback started from ' + device.getName() + ' on station ' + station.getName(), true);

    const args = '-re -i ' + mp3Path + ' ' +
                 '-acodec aac ' +
                 '-ac 1 ' +
                 '-ar 16k ' +
                 '-b:a 16k ' +
                 '-f adts pipe:1';
    
    const ffmpeg = spawn(ffmpegPath, args.split(/\s+/), { env: process.env });

    ffmpeg.stdout.pipe(stream);

    ffmpeg.on('error', (err) => {
      this.log('FFMpeg error: ' + err);
    });
    ffmpeg.stderr.on('data', (data) => {
      data.toString().split('\n').forEach((line) => {
        if (line.length > 0) {
          this.log(line);
        }
      });
    });
    ffmpeg.on('close', () => {
      this.log('ffmpeg closed.');
    });
  }

  async actionTalkbackStop(deviceId) {
    console.clear();
    const device = this.devices[deviceId];
    this.log('Stop talkback feature on ' + device.getName() + '...', true);

    try {
      await this.eufyClient.stopStationTalkback(device.getSerial());
    } catch (err) {
      this.log('Could not stop talkback: ' + err, true);
    }

    setTimeout(() => {
      this.actionDeviceMenu(deviceId);
    }, 5000);
  }

  onStationTalkbackStop(station, device) {
    this.log('Event: Talkback stopped from ' + device.getName() + ' on station ' + station.getName(), true);
  }

  actionSettingsMenu() {
    this.log('Enter settings menu.')

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

  actionMaxLivestreamDuration() {
    this.log('Set maximum livestream duration');

    console.clear();

    readline.question('Enter maximum duration for livestreams (in seconds): ', choice => {
      var value = this.getMenuChoice(choice);
      if(!value || value < 1) {
        this.log('No valid value entered!', true);
        setTimeout(() => {
          this.actionSettingsMenu();
        }, 4000);
        return;
      }

      this.eufyClient.setCameraMaxLivestreamDuration(value);
      this.log('Set ' + value + ' seconds as maximum livestream duration.', true);
      setTimeout(() => {
        this.actionSettingsMenu();
      }, 4000);
    });
  }

  getStation(serial) {
    this.log('Trying to find station with serial ' + serial);
    for (var i=0; i<this.stations.length; i++) {
      if (this.stations[i].getSerial() == serial) return this.stations[i];
    }

    return null;
  }

  notImplementedYet() {
    this.log('Not implemented yet! Going back...', true);
    setTimeout(() => {
      this.actionMainMenu();
    }, 4000);
  }
}

async function main_loop() {
  const platform = new EufyPlatform(config);
  await platform.connect();
};

main_loop();
