'use strict'

//-------------

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser')
const app = express();

app.use(bodyParser.json());

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//-------

// Only if needed - For self-signed certificate in chain - In test environment
// Do not uncomment next line in production environment
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

//-------

const servicePhoneNumber = process.env.SERVICE_PHONE_NUMBER;
console.log("Service phone number:", servicePhoneNumber);

const pstnNumber1 = process.env.PSTN_NUMBER_1;
console.log("Test default PSTN phone number 1:", pstnNumber1);

const pstnNumber2 = process.env.PSTN_NUMBER_2;
console.log("Test default PSTN phone number 2:", pstnNumber2);

const customParam1 = process.env.CUSTOM_PARAM_1;
console.log("Test default custom paramater 1:", customParam1);

const customParam2 = process.env.CUSTOM_PARAM_2;
console.log("Test default custom paramater 2:", customParam2);

//--- Vonage API ---

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

const apiBaseUrl = "https://" + process.env.API_REGION;

const options = {
  apiHost: apiBaseUrl
};

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials, options);

// Use for direct REST API calls - Sample code
// const appId = process.env.APP_ID; // used by tokenGenerate
// const privateKey = fs.readFileSync('./.private.key'); // used by tokenGenerate
// const { tokenGenerate } = require('@vonage/jwt');

//-------------------

// WebSocket server (middleware)
const processorServer = process.env.PROCESSOR_SERVER;

//-------------------

let uuids = {};

function addToUuids(originalUuid) {
  uuids[originalUuid] = {};  // dictionary - using ws1 uuid
  uuids[originalUuid]["calledPstn1"] = false;
  uuids[originalUuid]["calledWs2"] = false;
  uuids[originalUuid]["calledPstn2"] = false;
  uuids[originalUuid]["pstn1Uuid"] = null; // will be filled
  uuids[originalUuid]["ws2Uuid"] = null; // will be filled
  uuids[originalUuid]["pstn2Uuid"] = null; // will be filled   
}

function deleteFromUuids(originalUuid) {
  delete uuids[originalUuid]
}

//-- testing uuids functions --

// addToUuids("abc123");
// uuids["abc123"]["pstn1Uuid"] = "cde456";

// console.log ("Uuids tracking:", uuids);

// delete uuids["abc123"];
// console.log ("Uuids tracking:", uuids);

// delete uuids["xyz890"];
// console.log ("Uuids tracking:", uuids);

//===========================================================

//-- Trigger outbound PSTN calls - see sample request below
//-- Sample request: https://<server-address/startcall?pstn1=12995551212&pstn2=12995551313&param1=en-US&param2=es-MX
app.get('/startcall', (req, res) => {

  res.status(200).send('Ok');

  const hostName = req.hostname;
  console.log("Host name:", hostName);

  //-- code may be added to check that pstn1 and pstn2 are valid phone numbers if present

  const callee1 = req.query.pstn1 || pstnNumber1; // defaults to env variable if not specified as query parameter
  const callee2 = req.query.pstn2 || pstnNumber2; // defaults to env variable if not specified as query parameter
  const attribute1 = req.query.param1 || customParam1; // defaults to env variable if not specified as query parameter
  const attribute2 = req.query.param2 || customParam2; // defaults to env variable if not specified as query parameter

  console.log("Calling", callee1, attribute1, callee2, attribute2);

  //-- WebSocket 1 connection --
  const wsUri = 'wss://' + processorServer + '/socket?participant=participant1&attribute1=' + attribute1 + '&attribute2=' + attribute2;   
  console.log('>>> Create Websocket 1:', wsUri);

  vonage.voice.createOutboundCall({
    to: [{
      type: 'websocket',
      uri: wsUri,
      'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
      headers: {}
    }],
    from: {
      type: 'phone',
      number: callee1
    },
    answer_url: ['https://' + hostName + '/ws_answer_1?callee1=' + callee1 + '&callee2=' + callee2 + '&attribute1=' + attribute1 + '&attribute2=' + attribute2],
    answer_method: 'GET',
    event_url: ['https://' + hostName + '/ws_event_1?callee1=' + callee1 + '&callee2=' + callee2 + '&attribute1=' + attribute1 + '&attribute2=' + attribute2],
    event_method: 'POST'
    })
    .then(res => {
      addToUuids(res.uuid); // create uuids tracking
      console.log ("Uuids tracking:", uuids);
      console.log(">>> WebSocket 1 create status:", res);
    })
    .catch(err => console.error(">>> WebSocket 1 create error:", err));
 
});


//--------------

app.get('/ws_answer_1', async(req, res) => {

  //-- Step 1 --

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.uuid, // unique conference name
      "startOnEnter": true
    }
  ];

  console.log('>>> Step 1 - Dropping WebSocket 1 into named conference:');
  console.log(nccoResponse);  

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_1', async(req, res) => {

  res.status(200).send('Ok');

  const hostName = req.hostname;
  const ws1Uuid = req.body.uuid;

  const callee2 = req.query.callee2;

  const attribute1 = req.query.attribute1;
  const attribute2 = req.query.attribute2;

  //--

  if (req.body.type == 'transfer' && !uuids[ws1Uuid]["calledPstn1"]) {

    uuids[ws1Uuid]["calledPstn1"] = true;

    // Call PSTN 1 participant 
    vonage.voice.createOutboundCall({
      to: [{
        type: 'phone',
        number: req.query.callee1
      }],
      from: {
       type: 'phone',
       number: servicePhoneNumber
      },
      answer_url: ['https://' + hostName + '/answer_1?original_uuid=' + ws1Uuid + '&callee2=' + callee2 + '&attribute1=' + attribute1 + '&attribute2=' + attribute2],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/event_1?original_uuid=' + ws1Uuid + '&callee2=' + callee2 + '&attribute1=' + attribute1 + '&attribute2=' + attribute2],
      event_method: 'POST'
      })
      .then(res => {
        uuids[ws1Uuid]["pstn1Uuid"] = res.uuid;
        console.log ("Uuids tracking:", uuids);
        console.log(">>> PSTN 1 call status:", res)
      })
      .catch(err => console.error(">>> PSTN 1 call error:", err))

  };

  //--

  if (req.body.status == 'completed') {

    console.log('>>> Websocket 1 leg',  ws1Uuid, 'terminated');
  
  };

});

//--------------

app.get('/answer_1', async(req, res) => {

  const ws1Uuid = req.query.original_uuid;

  //-- Step 2 --

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + ws1Uuid, // same conference name as for WebSocket 1 leg
      "canSpeak": [ws1Uuid],  // can send audio to WebSocket 1 leg only
      "canHear": [],  // WebSocket 2 leg is not yet up
      "startOnEnter": true
    }
  ];

  console.log('>>> Step 2 - Dropping PSTN 1 into named conference:');
  console.log(nccoResponse);  

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/event_1', async(req, res) => {

  res.status(200).send('Ok');

  const hostName = req.hostname;

  const ws1Uuid = req.query.original_uuid;
  const pstn1Uuid = req.body.uuid;

  const callee2 = req.query.callee2;

  const attribute1 = req.query.attribute1;
  const attribute2 = req.query.attribute2;

  //--

  if (req.body.type == 'transfer' && !uuids[ws1Uuid]["calledWs2"]) {

    uuids[ws1Uuid]["calledWs2"] = true;

    //-- WebSocket 2 connection --
    const wsUri = 'wss://' + processorServer + '/socket?participant=participant2&attribute1=' + attribute1 + '&attribute2=' + attribute2;   
    console.log('>>> Create Websocket 2:', wsUri);

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
        headers: {}
      }],
      from: {
        type: 'phone',
        number: callee2 
      },
      answer_url: ['https://' + hostName + '/ws_answer_2?original_uuid=' + ws1Uuid + '&pstn1_uuid=' + pstn1Uuid + '&callee2=' + callee2 + '&attribute1=' + attribute1 + '&attribute2=' + attribute2],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_2?original_uuid=' + ws1Uuid + '&pstn1_uuid=' + pstn1Uuid + '&callee2=' + callee2 + '&attribute1=' + attribute1 + '&attribute2=' + attribute2],
      event_method: 'POST'
      })
      .then(res => {
        uuids[ws1Uuid]["ws2Uuid"] = res.uuid;
        console.log ("Uuids tracking:", uuids);
        console.log(">>> WebSocket 2 create status:", res);
      })
      .catch(err => console.error(">>> WebSocket 2 create error:", err));

    //-- Step 3 -- Update WebSocket 1 audio controls

    const ncco =
      [
        {
          "action": "conversation",
          "name": "conf_" + ws1Uuid, // put back in same named conference
          "canSpeak": [], // PSTN 2 leg is not yet up
          "canHear": [pstn1Uuid],  // Receives audio from PSTN 1 leg only only
          "startOnEnter": true
        }
      ];
      
    console.log('>>> Step 3 - Updating WebSocket 1 audio controls:');
    console.log(ncco);  

    vonage.voice.transferCallWithNCCO(ws1Uuid, ncco)
    .then(res => console.log(">>> Step 3 - WebSocket 1 audio controls updated"))
    .catch(err => console.error(">>> Step 3 - Updating WebSocket 1 audio controls error:", err))

  };  

  //--

  if (req.body.status == 'completed') {

    //-- Terminate WebSocket 1 --
    vonage.voice.getCall(ws1Uuid)
      .then(res => {
        if (res.status != 'completed') {
          vonage.voice.hangupCall(ws1Uuid)
            .then(res => console.log(">>> Terminating WebSocket 1 leg", ws1Uuid))
            .catch(err => null) // WebSocket 1 leg has already terminated
        }
       })
      .catch(err => console.error(">>> error get call status of WebSocket 1 leg ", ws1Uuid, err))      

    //-- Terminate WebSocket 2 --
    if(uuids[ws1Uuid]["ws2Uuid"]) { // has WebSocket 2 been created?
      const ws2Uuid = uuids[ws1Uuid]["ws2Uuid"];

      vonage.voice.getCall(ws2Uuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(ws2Uuid)
              .then(res => console.log(">>> Terminating WebSocket 2 leg", ws2Uuid))
              .catch(err => null) // WebSocket 2 leg has already terminated
          }
         })
        .catch(err => console.error(">>> error get call status of WebSocket 2 leg ", ws2Uuid, err))           
    }    

    //-- Terminate PSTN 2 --
    if(uuids[ws1Uuid]["pstn2Uuid"]) { // has PSTN 2 been created?
      const pstn2Uuid = uuids[ws1Uuid]["pstn2Uuid"];

      vonage.voice.getCall(pstn2Uuid)
        .then(res => {
          if (res.status == 'ringing' || res.status == 'answered') {
            vonage.voice.hangupCall(pstn2Uuid)
              .then(res => console.log(">>> Terminating PSTN 2 leg", pstn2Uuid))
              .catch(err => null) // PSTN 2 leg has already terminated
          }
         })
        .catch(err => console.error(">>> error get call status of PSTN 2 leg ", pstn2Uuid, err))           
    }   

    //--

    setTimeout( () => {

      delete uuids[ws1Uuid];  // set of uuids info no longer needed
      console.log ("Uuids tracking:", uuids);   

    }, 30000);  // 30 sec, approximate max time to make sure all 4 related legs are terminated

    //--

    console.log('>>> PSTN 1 leg',  pstn1Uuid, 'terminated');

  };

});

//--------------

app.get('/ws_answer_2', async(req, res) => {

  //-- Step 4 --

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.original_uuid, // same conference name as for WebSocket 1 leg
      "canSpeak": [req.query.pstn1_uuid], // sends audio to PSTN 1 leg only
      "canHear": [], // PSTN 2 leg is not yet up
      "startOnEnter": true
    }
  ];

  console.log('>>> Step 4 - Dropping WebSocket 2 into named conference:');
  console.log(nccoResponse);  

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_2', async(req, res) => {

  res.status(200).send('Ok');

  const hostName = req.hostname;

  const pstn1Uuid = req.query.pstn1_uuid;
  
  const ws1Uuid = req.query.original_uuid;
  const ws2Uuid = req.body.uuid;

  const callee2 = req.query.callee2;

  const attribute1 = req.query.attribute1;
  const attribute2 = req.query.attribute2;

  //--

  if (req.body.type == 'transfer' && !uuids[ws1Uuid]["calledPstn2"]) {

    uuids[ws1Uuid]["calledPstn2"] = true;

    //-- Call PSTN 2 participant --
    vonage.voice.createOutboundCall({
      to: [{
        type: 'phone',
        number: callee2
      }],
      from: {
       type: 'phone',
       number: servicePhoneNumber
      },
      answer_url: ['https://' + hostName + '/answer_2?original_uuid=' + ws1Uuid + '&pstn1_uuid=' + pstn1Uuid + '&ws2_uuid=' + ws2Uuid + '&callee2=' + callee2 + '&attribute1=' + attribute1 + '&attribute2=' + attribute2],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/event_2?original_uuid=' + ws1Uuid + '&pstn1_uuid=' + pstn1Uuid + '&ws2_uuid=' + ws2Uuid + '&callee2=' + callee2 + '&attribute1=' + attribute1 + '&attribute2=' + attribute2],
      event_method: 'POST'
      })
      .then(res => {
        uuids[ws1Uuid]["pstn2Uuid"] = res.uuid;
        console.log ("Uuids tracking:", uuids);
        console.log(">>> PSTN 2 call status:", res)
      })
      .catch(err => console.error(">>> PSTN 2 call error:", err))

      //-- Step 5 - Update PSTN 1 audio controls
      const ncco =
        [
          {
            "action": "conversation",
            "name": "conf_" + ws1Uuid, // put back in same named conference
            "canSpeak": [ws1Uuid], // PSTN 1 leg sends audio to WebSocket 1 leg only
            "canHear": [ws2Uuid],  // PSTN 1 leg receives audio from WebSocket 2 leg only
            "startOnEnter": true,
            "endOnExit": true
          }
        ]
      
      console.log('>>> Step 5 - Updating PSTN 1 audio controls:');
      console.log(ncco);       

      vonage.voice.transferCallWithNCCO(pstn1Uuid, ncco)
      .then(res => console.log(">>> Step 5 - PSTN 1 audio controls updated"))
      .catch(err => console.error(">>> Step 5 - Updating PSTN 1 audio controls error:", err))

  };

  //--

  if (req.body.status == 'completed') {

    console.log('>>> WebSocket 2 leg',  ws2Uuid, 'terminated');

  };

});

//--------

app.get('/answer_2', async(req, res) => {

  const ws1Uuid = req.query.original_uuid;

  //-- Step 6 --

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + ws1Uuid,  // same conference name as for WebSocket 1 leg
      "canSpeak": [req.query.ws2_uuid], // sends audio to WebSocket 2 leg only
      "canHear": [ws1Uuid], // receives audio from WebSocket 1 leg only
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  console.log('>>> Step 6 - Dropping PSTN 2 into named conference:');
  console.log(nccoResponse);  

  res.status(200).json(nccoResponse);

});

//--------------

app.post('/event_2', async(req, res) => {

  res.status(200).send('Ok');

  //--

  const ws1Uuid = req.query.original_uuid;
  const ws2Uuid = req.query.ws2_uuid;
  const pstn1Uuid = req.query.pstn1_uuid;
  const pstn2Uuid = req.body.uuid;

  const status = req.body.status;

  //--

  if (req.body.type == 'transfer') {

    vonage.voice.getCall(ws1Uuid)
      .then(res => {
        if (res.status == 'answered') { // is WebSocket 1 leg still up?

          const ncco =
            [
              {
                "action": "conversation",
                "name": "conf_" + ws1Uuid, // put back in same named conference
                "canSpeak": [pstn2Uuid], // WebSocket 1 leg sends audio to PSTN 2 leg only
                "canHear": [pstn1Uuid],  // WebSocket 1 leg receives audio from PSTN 1 leg only
                "startOnEnter": true
              }
            ] 
            
          console.log('>>> Step 7 - Updating WebSocket 1 audio controls:');
          console.log(ncco);  
 
          //-- Step 7 -- Update WebSocket 1 audio controls
          vonage.voice.transferCallWithNCCO(ws1Uuid, ncco)
          .then(res => console.log(">>> Step 7 - WebSocket 1 audio controls updated"))
          .catch(err => console.error(">>> Step 7 - Updating WebSocket 1 audio controls error:", err))  
        
        }
      })
      .catch(err => {
        console.error(">>> error get call status of WebSocket 1 leg", ws1Uuid, err);
      })


    //-----

    vonage.voice.getCall(ws2Uuid)
      .then(res => {
        if (res.status == 'answered') { // is WebSocket 2 leg still up?

          const ncco =
            [
              {
                "action": "conversation",
                "name": "conf_" + ws1Uuid, // put back in same named conference
                "canSpeak": [pstn1Uuid], // WebSocket 2 leg sends audio to PSTN 1 leg only
                "canHear": [pstn2Uuid],  // WebSocket 2 leg receives audio from PSTN 2 leg only
                "startOnEnter": true
              }
            ];
      
          console.log('>>> Step 8 - Updating WebSocket 2 audio controls:');
          console.log(ncco);  


          //-- Step 8 --Update WebSocket 2 audio controls
          vonage.voice.transferCallWithNCCO(ws2Uuid, ncco)
          .then(res => console.log(">>> Step 8 - WebSocket 2 audio controls updated"))
          .catch(err => console.error(">>> Step 8 - Updating WebSocket 2 audio controls error:", err)) 
        
        }
      })
      .catch(err => {
        console.error(">>> error get call status of WebSocket 2 leg", ws2Uuid, err);
      })
  
  };

  //-----

  if (status == 'ringing' || status == 'answered') {
    
    //-- Check PSTN 1 leg status
    vonage.voice.getCall(pstn1Uuid)
      .then(res => {
        if (res.status == 'completed') {  // has PSTN 1 leg terminated?
        
          //-- Terminate this leg - PSTN 2
          vonage.voice.hangupCall(pstn2Uuid)
            .then(res => console.log(">>> Terminating PSTN 2 leg", pstn2Uuid))
            .catch(err => null) // PSTN 2 leg has already terminated

          //-- Check WebSocket 2 leg status
          vonage.voice.getCall(ws2Uuid)
            .then(res => {
              if (res.status != 'completed') {  // WebSocket 2 leg not yet terminated?
      
                //-- Terminate this leg - WebSocket 2
                vonage.voice.hangupCall(ws2Uuid)
                  .then(res => console.log(">>> Terminating WebSocket 2 leg", ws2Uuid))
                  .catch(err => null) // WebSocket 2 leg has already terminated
              }
            })     
            .catch(err => console.error(">>> error get call status of WebSocket 2 leg ", ws2Uuid, err))
        
        }
       })
      .catch(err => console.error(">>> error get call status of PSTN 1 leg ", pstn1Uuid, err))      
  
  };

  //-----

  if (status == 'completed') {
    
    console.log('>>> PSTN 2 leg',  pstn2Uuid, 'terminated');
  
  };

});

//============= Processing unexpected inbound PSTN calls ===============

app.get('/answer', async(req, res) => {

  const nccoResponse = [
    {
      "action": "talk",
      "text": "This number does not accept incoming calls.",
      "language": "en-US",
      "style": 11
    }
  ];

  res.status(200).json(nccoResponse);

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

});

//------------

app.post('/analytics', async(req, res) => {

  res.status(200).send('Ok');

});

//--- If this application is hosted on Vonage Cloud Runtime (VCR) serverless infrastructure --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.VCR_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`Voice API application listening on port ${port}!`));

//------------
