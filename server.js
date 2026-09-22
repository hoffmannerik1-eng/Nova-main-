require("dotenv").config();

const express = require("express");
const cors = require("cors");
const twilio = require("twilio");

const app = express();

const {
  VoiceResponse
} = twilio.twiml;


/* =====================================================
   CONFIG
   ===================================================== */

const PORT =
  process.env.PORT || 3000;

const GEMINI_KEY =
  process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash";


/* =====================================================
   MIDDLEWARE
   ===================================================== */

app.use(
  cors({
    origin:"*"
  })
);

app.use(
  express.json()
);

app.use(
  express.urlencoded({
    extended:true
  })
);


/* =====================================================
   BASIC
   ===================================================== */

app.get(
  "/",
  (req,res) => {

    res.json({
      name:"NOVA AI",
      status:"online"
    });

  }
);


/* =====================================================
   GEMINI
   ===================================================== */

async function askGemini(
  text,
  location = null
){

  if(!GEMINI_KEY){

    throw new Error(
      "GEMINI_API_KEY fehlt."
    );

  }

  let locationText =
    "Kein Standort verfügbar.";

  if(location){

    locationText =
      `Der Benutzer hat seinen Standort freigegeben.
Breitengrad: ${location.latitude}
Längengrad: ${location.longitude}`;

  }


  const systemPrompt = `

Du bist NOVA, eine persönliche Sprach-KI.

Du sprichst natürlich, freundlich,
direkt und kurz.

Du bist keine Kopie einer bekannten Film-KI.

Wenn der Benutzer nach Wetter fragt,
gib eine kurze Antwort und setze ACTION:
WEATHER.

Wenn der Benutzer nach einem Ort fragt,
setze ACTION: MAP.

Wenn keine besondere Aktion notwendig ist,
setze ACTION: NONE.

Standort:
${locationText}

Antworte immer in diesem Format:

TEXT: deine Antwort

ACTION: NONE

oder:

TEXT: deine Antwort

ACTION: WEATHER

oder:

TEXT: deine Antwort

ACTION: MAP

`;


  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;


  const response =
    await fetch(
      url,
      {
        method:"POST",

        headers:{
          "Content-Type":
            "application/json"
        },

        body:JSON.stringify({

          systemInstruction:{
            parts:[
              {
                text:
                  systemPrompt
              }
            ]
          },

          contents:[
            {
              role:"user",

              parts:[
                {
                  text
                }
              ]
            }
          ],

          generationConfig:{
            temperature:0.7,
            maxOutputTokens:300
          }

        })

      }
    );


  if(!response.ok){

    const error =
      await response.text();

    throw new Error(
      "Gemini API: " +
      error
    );

  }


  const data =
    await response.json();


  const raw =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();


  if(!raw){

    throw new Error(
      "Gemini hat keine Antwort geliefert."
    );

  }


  let action =
    "NONE";

  if(
    raw.toUpperCase()
      .includes("ACTION: WEATHER")
  ){

    action =
      "WEATHER";

  }

  if(
    raw.toUpperCase()
      .includes("ACTION: MAP")
  ){

    action =
      "MAP";

  }


  const text =
    raw
      .replace(
        /ACTION:\s*(WEATHER|MAP|NONE)/gi,
        ""
      )
      .replace(
        /^TEXT:\s*/i,
        ""
      )
      .trim();


  return {
    text,
    action
  };

}


/* =====================================================
   WEB CHAT
   ===================================================== */

app.post(
  "/api/chat",
  async (req,res) => {

    try{

      const {
        text,
        location
      } = req.body;


      if(
        typeof text !== "string" ||
        !text.trim()
      ){

        return res.status(400)
          .json({
            error:
              "Text fehlt."
          });

      }


      const result =
        await askGemini(
          text.trim(),
          location
        );


      let action = null;


      if(
        result.action ===
        "WEATHER"
      ){

        action = {

          type:"weather",

          temperature:
            "--",

          description:
            "Wetterfunktion kann mit einem Wetterdienst verbunden werden.",

          location:
            "Aktueller Standort"

        };

      }


      if(
        result.action ===
        "MAP"
      ){

        action = {

          type:"map",

          name:
            extractPlace(text),

          description:
            "Ort auf der Karte öffnen."

        };

      }


      res.json({

        text:
          result.text,

        action

      });


    }catch(error){

      console.error(error);

      res.status(500)
        .json({

          error:
            "NOVA konnte die Anfrage nicht verarbeiten."

        });

    }

  }
);


/* =====================================================
   PLACE EXTRACTION
   ===================================================== */

function extractPlace(text){

  const lower =
    text.toLowerCase();

  const knownPlaces = [

    ["eiffelturm","Eiffelturm"],
    ["eiffel turm","Eiffelturm"],
    ["berlin","Berlin"],
    ["paris","Paris"],
    ["rom","Rom"],
    ["london","London"],
    ["new york","New York"],
    ["hamburg","Hamburg"],
    ["münchen","München"],
    ["frankfurt","Frankfurt"]

  ];


  for(
    const [needle,name]
    of knownPlaces
  ){

    if(
      lower.includes(needle)
    ){

      return name;

    }

  }


  return text;

}


/* =====================================================
   TELEFON
   ===================================================== */

app.post(
  "/voice",
  async (req,res) => {

    const twiml =
      new VoiceResponse();


    twiml.say(
      {
        language:"de-DE"
      },
      "Hallo. Ich bin NOVA. Wie kann ich dir helfen?"
    );


    twiml.gather({

      input:"speech",

      language:"de-DE",

      speechTimeout:"auto",

      action:
        "/voice/process",

      method:"POST"

    });


    res.type(
      "text/xml"
    );

    res.send(
      twiml.toString()
    );

  }
);


/* =====================================================
   TELEFON SPRACHE VERARBEITEN
   ===================================================== */

app.post(
  "/voice/process",
  async (req,res) => {

    const twiml =
      new VoiceResponse();


    const speech =
      req.body.SpeechResult || "";


    if(!speech){

      twiml.say(
        {
          language:"de-DE"
        },
        "Ich habe dich leider nicht verstanden."
      );

      twiml.redirect(
        "/voice"
      );

      return sendTwiml(
        res,
        twiml
      );

    }


    try{

      const result =
        await askGemini(
          speech,
          null
        );


      twiml.say(
        {
          language:"de-DE"
        },
        result.text
      );


      const gather =
        twiml.gather({

          input:"speech",

          language:"de-DE",

          speechTimeout:"auto",

          action:
            "/voice/process",

          method:"POST"

        });


      gather.say(
        {
          language:"de-DE"
        },
        "Ich höre."
      );


    }catch(error){

      console.error(error);

      twiml.say(
        {
          language:"de-DE"
        },
        "Es ist gerade ein technischer Fehler aufgetreten."
      );

    }


    sendTwiml(
      res,
      twiml
    );

  }
);


/* =====================================================
   TWIML RESPONSE
   ===================================================== */

function sendTwiml(
  res,
  twiml
){

  res.type(
    "text/xml"
  );

  res.send(
    twiml.toString()
  );

}


/* =====================================================
   START
   ===================================================== */

app.listen(
  PORT,
  () => {

    console.log(
      `NOVA läuft auf Port ${PORT}`
    );

  }
);
