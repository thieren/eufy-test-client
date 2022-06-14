# eufy-test-client
Small commandline application to test various functions of eufy-security-client library

### Important!

This is just a tool I made so I get a better understanding of the inner workings of the eufy-security-client library.
If you're looking for a more complete/robust/better programmed way to interact with this library on a command-line basis I strongly recommened that you check out eufy-securtiy-ws (https://github.com/bropat/eufy-security-ws)

### How to use

1. Download the code to a folder on your computer.
2. Edit `config.js` and update your credentials for the eufy cloud.
3. Run `npm install` in a terminal in the location where you downloaded the code
4. Run `node index.js` and follow the onscreen menu.

### Current features
- Connect to eufy security cloud
- 2FA Authorization
- Captcha Request handling
- List stations and devices
- Change guard mode on stations
- Trigger and reset alarm
- Start/Stop P2P Livestream on devices
- Test Talkback feature on devices
- set maximum livestream duration
- save logfile
- save log for eufy-security-client library separately


