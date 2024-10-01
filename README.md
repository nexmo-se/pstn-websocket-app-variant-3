# Application using Vonage Voice API to connect PSTN legs with WebSockets legs in a 1-to-1 relationship - Variant 3

## Set up

### Set up the sample basic middleware server - Host server public hostname and port

First set up the basic middleware server from https://github.com/nexmo-se/websocket-server-variant-3.

Default local (not public!) of that middleware server `port` is: 6000.

If you plan to test using `Local deployment` with ngrok (Internet tunneling service) for both the sample middleware server application and this sample Voice API application, you may set up [multiple ngrok tunnels](https://ngrok.com/docs/agent/config/#tunnel-configurations).

For the next steps, you will need:
- That middleware public hostname and if necessary public port,</br>
e.g. `xxxxxxxx.ngrok.io`, `xxxxxxxx.herokuapp.com`, `myserver.mycompany.com:32000`  (as **`PROCESSOR_SERVER`**),</br>
no `port` is necessary with ngrok or heroku as public hostname.</br>

### Set up your Vonage Voice API application credentials and phone number

[Log in to your](https://dashboard.nexmo.com/sign-in) or [sign up for a](https://dashboard.nexmo.com/sign-up) Vonage APIs account.

Go to [Your applications](https://dashboard.nexmo.com/applications), access an existing application or [+ Create a new application](https://dashboard.nexmo.com/applications/new).

Under Capabilities section (click on [Edit] if you do not see this section):

Enable Voice
- Under Answer URL, leave HTTP GET, and enter https://\<host\>:\<port\>/answer (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
- Under Event URL, **select** HTTP POST, and enter https://\<host\>:\<port\>/event (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
Note: If you are using ngrok for this sample application, the answer URL and event URL look like:</br>
https://yyyyyyyy.ngrok.io/answer</br>
https://yyyyyyyy.ngrok.io/event</br> 	
- Click on [Generate public and private key] if you did not yet create or want new ones, save the private key file in this application folder as .private.key (leading dot in the file name).</br>
**IMPORTANT**: Do not forget to click on [Save changes] at the bottom of the screen if you have created a new key set.</br>
- Link a phone number to this application if none has been linked to the application.

Please take note of your **application ID** and the **linked phone number** (as they are needed in the very next section).

For the next steps, you will need:</br>
- Your [Vonage API key](https://dashboard.nexmo.com/settings) (as **`API_KEY`**)</br>
- Your [Vonage API secret](https://dashboard.nexmo.com/settings), not signature secret, (as **`API_SECRET`**)</br>
- Your `application ID` (as **`APP_ID`**),</br>
- The **`phone number linked`** to your application (as **`SERVICE_PHONE_NUMBER`**), your phone will **call that number**,</br>

### Local setup

Copy or rename .env-example to .env<br>
Update parameters in .env file<br>
Have Node.js installed on your system, this application has been tested with Node.js version 18.19.1<br>

Install node modules with the command:<br>
 ```bash
npm install
```

Launch the application:<br>
```bash
node pstn-websocket-app
```

Default local (not public!) of this application server `port` is: 8000.

## Overview of how this application establishes PSTN and WebSocket calls

See corresponding diagram *call-flow.png*

Step 1 - Establish WebSocket 1 call, once answered drop that leg into a unique named conference (NCCO with action conversation).

Step 2 - Place outbound PSTN 1 call, once answered drop that leg into same named conference (NCCO with action conversation).

Step 4 - Establish WebSocket 2 call, once answered drop that leg into same named conference (NCCO with action conversation).

Step 6 - Place outbound PSTN 2 call, once answered drop that leg into same named conference (NCCO with action conversation).

### Additional info

In step 1, regarding WebSocket 1 leg, there are no specific audio controls yet.</br>

In step 2, regarding PSTN 1 leg,</br>
the NCCO with action conversation includes the array parameter *canSpeak* that lists WebSocket 1 leg uuid,</br>
meaning PSTN 1 sends audio to WebSocket 1 leg,</br>
the array parameter *canHear* stays empty for now.</br>

In step 3, regarding WebSocket 1 leg,</br>
the NCCO with action conversation includes the array parameter *canHear* that lists PSTN 1 leg uuid,</br>
meaning WebSocket 1 receives only the audio from PSTN 1 leg,</br>
the array parameter *canSpeak* stays empty for now.</br>

In step 4, regarding WebSocket 2 leg,</br>
the NCCO with action conversation includes the array parameter *canSpeak* that lists PSTN 1 leg uuid,</br>
meaning WebSocket 2 sends audio only to PSTN 1 leg,</br>
the array parameter *canHear* stays empty for now.</br>

In step 5, regarding PSTN 1 leg,</br>
the NCCO with action conversation includes the array parameter *canSpeak* that lists WebSocket 1 leg uuid,</br>
meaning PSTN 1 sends audio only to WebSocket 1 leg,</br>
the array parameter *canHear* that lists WebSocket 2 leg uuid,</br>
meaning PSTN 1 receives audio only from WebSocket 2 leg.</br>

In step 6, regarding PSTN 2 leg,</br>
the NCCO with action conversation includes the array parameter *canSpeak* that lists WebSocket 2 leg uuid,</br>
meaning PSTN 2 sends audio only to WebSocket 2 leg,</br>
the array parameter *canHear* that lists WebSocket 1 leg uuid,</br>
meaning PSTN 2 receives audio only from WebSocket 1 leg.</br>

In step 7, regarding WebSocket 1 leg,</br>
the NCCO with action conversation includes the array parameter *canSpeak* that lists PSTN 2 leg uuid,</br>
meaning WebSocket 1 sends audio only to PSTN 2 leg,</br>
the array parameter *canHear* that lists PSTN 1 leg uuid,</br>
meaning WebSocket 1 receives audio only from PSTN 1  leg.</br>

In step 8, regarding WebSocket 2 leg,</br>
the NCCO with action conversation includes the array parameter *canSpeak* that lists PSTN 1 leg uuid,</br>
meaning WebSocket 2 sends audio only to PSTN 1 leg,</br>
the array parameter *canHear* that lists PSTN 2 leg uuid,</br>
meaning WebSocket 2 receives audio only from PSTN 2  leg.</br>



In steps 6 and 7, both NCCOs with action conversation include endOnExit true flag because if either PSTN 1 or PSTN 2 remote party ends the call, then all legs attached to the same conference should be terminated.</br>

In step 2, the NCCO with action conversation does not include endOnExit true flag because it may automatically terminate all legs which is an undesired behavior.</br>

Application automatically terminates PSTN 2 leg call setup in progress (e.g. in ringing state, ...) if PSTN 1 leg remote party hung up while PSTN 2 party is being called or just answered.</br>

When establishing WebSockets, desired custom meta data that should be transmitted to the middleware server are passed as query parameters in the WebSocket URI itself.</br>
In this sample code, sample meta data parameters are passed, you may define what are needed for your application logic.</br>

### Try the application

From a web browser trigger test calls with the web address:</br>

`https://<server-address/startcall`

or

`https://<server-address/startcall?pstn1=12995551212&pstn2=12995551313&param1=en-US&param2=es-MX`




