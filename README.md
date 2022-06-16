# eufy-test-client
Small commandline application to test various functions of eufy-security-client library

### Important!

This is just a tool I made so I get a better understanding of the inner workings of the eufy-security-client library.
If you're looking for a more complete/robust/better programmed way to interact with this library on a command-line basis I strongly recommened that you check out eufy-securtiy-ws (https://github.com/bropat/eufy-security-ws)

### How to install and run

1. Download the code via `git clone --recursive https://github.com/thieren/eufy-test-client.git`
2. Change into the created `eufy-test-client` folder
3. Run `cd eufy-security-client; npm install; npm run build; cd ..; npm install`
   This installs and builds the development dependencies and may take a while.
4. Run `node index.js`

### How to use

* the tool will present a command line style application with various menus you can select from
* the most options should be self explanatory (e.g. devices -> camera device -> start livestream)
* for many options you will only see a descriptive text (e.g. command to start stream sent) but nothing will seems to happen
  the data will be sent in the background. The important messages will be written to the logs, which you can access/save through the main menu
* Therefore if the program just prints out some text and nothing seems to happen, hit enter to get back into the menus and look into the logs whether your action was succesful.
* when you login you may encounter a captcha or 2fa request. While 2fa is straight forward (an otp code will be sent to your mail. just enter it in the tool) for a captcha a long data-url will be print to the console. You can copy/paste it to any browser url bar to view the captcha image. Then enter the captcha text in the tool.

### Current features
- Connect to eufy security cloud
- 2FA Authorization
- Captcha Request handling
- List stations and devices
- Change guard mode on stations
- Trigger and reset alarm
- Start/Stop P2P Livestream on devices
- Start/Stop Cloud livestream on devices
- get RTSP capabilities of devices
- Test Talkback feature on devices
- set maximum livestream duration
- save logfile
- save log for eufy-security-client library separately


