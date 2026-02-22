const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot Actif'));
app.listen(process.env.PORT || 3000);

async function startBot() {
    // Force la création d'un dossier propre
    const { state, saveCreds } = await useMultiFileAuthState('session_ayanokoji');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Mac OS", "Safari", "10.15.7"]
    });

    // Demande du code de jumelage simplifié
    if (!sock.authState.creds.registered) {
        console.log("Attente de 10s...");
        await delay(10000);
        let code = await sock.requestPairingCode("243986860268");
        console.log(`\nTON CODE : ${code}\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            let reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log("Relance rapide...");
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ BOT EN LIGNE');
        }
    });
}
startBot();

