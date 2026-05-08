// ======================================
// server.js
// ======================================

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());

app.use(express.json());

// ======================================
// CONFIG
// ======================================

const APIFY_TOKEN =
"apify_api_vTysQMyAiheE4X5sKTTDCsCu9ieCJH2vpnrU";

const LASTFM_API_KEY =
"934535854489c4330843ffa6fc3878bf";

const APIFY_ACTOR =
"https://api.apify.com/v2/acts/vvSeSCimywoM62CdX/runs";

// ======================================
// YOUTUBE ID
// ======================================

function getYoutubeId(url){

    const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;

    const match = url.match(regExp);

    return (
        match &&
        match[2].length === 11
    )
    ? match[2]
    : null;
}

// ======================================
// WAIT
// ======================================

function wait(ms){

    return new Promise(
        resolve => setTimeout(resolve,ms)
    );
}

// ======================================
// LASTFM
// ======================================

async function buscarLastFM(
    artista,
    musica
){

    try{

        const url =
        `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artista)}&track=${encodeURIComponent(musica)}&format=json`;

        const response =
        await axios.get(url);

        const data =
        response.data;

        if(
            data.track &&
            data.track.album
        ){

            const images =
            data.track.album.image;

            return{

                title:
                data.track.name ||

                musica,

                artist:
                data.track.artist?.name ||

                artista,

                album:
                data.track.album.title ||

                "Álbum desconhecido",

                cover:
                images?.length
                ? images[
                    images.length - 1
                  ]["#text"]
                : ""
            };
        }

    }catch(err){

        console.log(err.message);
    }

    return null;
}

// ======================================
// API
// ======================================

app.post(
    "/convert",
    async (req,res)=>{

    try{

        const { url } =
        req.body;

        if(!url){

            return res.status(400).json({
                error:"URL obrigatória"
            });
        }

        const videoId =
        getYoutubeId(url);

        if(!videoId){

            return res.status(400).json({
                error:"URL inválida"
            });
        }

        // ======================================
        // APIFY START
        // ======================================

        const runResponse =
        await axios.post(

            `${APIFY_ACTOR}?token=${APIFY_TOKEN}`,

            {
                videoUrls:[url],

                audioQuality:"192",

                proxyMode:"residential",

                maxDurationSeconds:3600
            },

            {
                headers:{
                    "Content-Type":
                    "application/json"
                }
            }
        );

        const runId =
        runResponse.data.data.id;

        let datasetId =
        null;

        // ======================================
        // WAIT PROCESS
        // ======================================

        for(
            let i=0;
            i<40;
            i++
        ){

            await wait(3000);

            const statusResponse =
            await axios.get(
                `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
            );

            const actorStatus =
            statusResponse.data.data.status;

            if(
                actorStatus ===
                "SUCCEEDED"
            ){

                datasetId =
                statusResponse
                .data
                .data
                .defaultDatasetId;

                break;
            }

            if(
                actorStatus ===
                "FAILED" ||

                actorStatus ===
                "ABORTED"
            ){

                return res.status(500).json({
                    error:"Falha conversão"
                });
            }
        }

        if(!datasetId){

            return res.status(500).json({
                error:"Tempo excedido"
            });
        }

        // ======================================
        // RESULT
        // ======================================

        const dataResponse =
        await axios.get(
            `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
        );

        const items =
        dataResponse.data;

        if(!items.length){

            return res.status(404).json({
                error:"Sem resultado"
            });
        }

        const music =
        items[0];

        const mp3Url =
        music.audioUrl;

        const title =
        music.title ||
        "AWSA Music";

        const thumbnail =
        music.thumbnailUrl;

        // ======================================
        // SPLIT TITLE
        // ======================================

        let artista = "";
        let musica = title;

        if(title.includes("-")){

            const split =
            title.split("-");

            artista =
            split[0].trim();

            musica =
            split
                .slice(1)
                .join("-")
                .trim();
        }

        // ======================================
        // LASTFM
        // ======================================

        const meta =
        await buscarLastFM(
            artista,
            musica
        );

        // ======================================
        // FINAL
        // ======================================

        return res.json({

            success:true,

            title:
            meta?.title ||
            title,

            artist:
            meta?.artist ||
            artista,

            album:
            meta?.album ||
            "Álbum desconhecido",

            cover:
            meta?.cover ||
            thumbnail,

            mp3:
            mp3Url
        });

    }catch(err){

        console.log(err);

        return res.status(500).json({
            error:"Erro interno"
        });
    }
});

// ======================================
// START
// ======================================

app.listen(
    3000,
    ()=>{

        console.log(
            "Servidor iniciado na porta 3000"
        );
    }
);