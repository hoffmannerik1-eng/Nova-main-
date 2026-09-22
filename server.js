import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({
    origin: true
}));

app.use(express.json({
    limit: "1mb"
}));

const PORT =
    process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";


const SYSTEM_PROMPT = `
Du bist JARVIS.

Du bist ein moderner persönlicher KI-Assistent.

Antworte standardmäßig auf Deutsch,
wenn der Nutzer Deutsch spricht.

Sei:
- freundlich
- ruhig
- natürlich
- intelligent
- direkt
- hilfreich

Keine unnötig langen Antworten.

Klinge wie ein fortschrittlicher persönlicher Assistent,
aber behaupte niemals, ein echter Mensch zu sein.

Wenn du etwas nicht weißt,
sag es ehrlich.
`;


function cleanHistory(history){

    if(!Array.isArray(history))
        return [];


    return history
        .slice(-18)
        .filter(
            item =>
                item &&
                (
                    item.role === "user" ||
                    item.role === "assistant"
                ) &&
                typeof item.text === "string"
        )
        .map(item => ({

            role:
                item.role === "assistant"
                    ? "model"
                    : "user",

            parts:[
                {
                    text:
                        item.text.slice(0,8000)
                }
            ]

        }));

}


app.get(
    "/health",
    (req,res) => {

        res.json({

            ok:true,

            service:"JARVIS",

            model:
                GEMINI_MODEL

        });

    }
);


app.post(
    "/api/chat",
    async (req,res) => {

        try{

            if(!GEMINI_API_KEY){

                return res
                    .status(500)
                    .json({

                        error:
                            "GEMINI_API_KEY fehlt."

                    });

            }


            const message =
                String(
                    req.body?.message || ""
                ).trim();


            if(!message){

                return res
                    .status(400)
                    .json({

                        error:
                            "Nachricht fehlt."

                    });

            }


            const history =
                cleanHistory(
                    req.body?.history
                );


            const contents = [

                ...history,

                {

                    role:"user",

                    parts:[
                        {
                            text:message
                        }
                    ]

                }

            ];


            const url =
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;


            const response =
                await fetch(
                    url,
                    {

                        method:"POST",

                        headers:{

                            "Content-Type":
                                "application/json",

                            "x-goog-api-key":
                                GEMINI_API_KEY

                        },

                        body:
                            JSON.stringify({

                                system_instruction:{

                                    parts:[
                                        {
                                            text:
                                                SYSTEM_PROMPT
                                        }
                                    ]

                                },

                                contents,

                                generationConfig:{

                                    maxOutputTokens:
                                        900

                                }

                            })

                    }
                );


            const data =
                await response.json();


            if(!response.ok){

                console.error(
                    "Gemini Fehler:",
                    data
                );


                return res
                    .status(response.status)
                    .json({

                        error:
                            data?.error?.message ||
                            "Gemini API Fehler."

                    });

            }


            const text =
                data
                ?.candidates?.[0]
                ?.content?.parts
                ?.map(
                    part =>
                        part.text || ""
                )
                .join("")
                .trim();


            res.json({

                text:
                    text ||
                    "Ich konnte gerade keine Antwort erzeugen."

            });


        }catch(error){

            console.error(error);

            res
                .status(500)
                .json({

                    error:
                        "Interner JARVIS-Serverfehler."

                });

        }

    }
);


app.listen(
    PORT,
    () => {

        console.log(
            `JARVIS Server läuft auf Port ${PORT}`
        );

    }
);
