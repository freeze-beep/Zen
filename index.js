const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, downloadContentFromMessage, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const config = require('./config');
const app = express();

app.get('/', (req, res) => res.send('Ayanokoji Bot Privé Actif'));
app.listen(process.env.PORT || 3000);

let botMode = false;

async function startBot() {
    // Utilisation d'un dossier de session robuste
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Mac OS", "Safari", "10.15.7"],
        connectTimeoutMs: 100000, // Temps augmenté pour stabiliser
        keepAliveIntervalMs: 30000
    });

    if (!sock.authState.creds.registered) {
        await delay(8000);
        let code = await sock.requestPairingCode(config.ownerNumber.split('@')[0]);
        console.log(`\n==========================================`);
        console.log(`VOTRE CODE : ${code}`);
        console.log(`==========================================\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("Connexion perdue, tentative de reconnexion...");
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Connexion établie. AYANOKOJI est prêt.');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const isOwner = sender.includes("243986860268");
        
        const type = Object.keys(msg.message)[0];
        const body = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : (type === 'imageMessage') ? msg.message.imageMessage.caption : '';
        
        // --- MODE BOT FROID ---
        if (botMode && !isOwner && !body.startsWith(config.prefix)) {
            return sock.sendMessage(from, { text: "Ne perds pas ton temps à me parler. Tu n'es qu'un outil." });
        }

        if (!body.startsWith(config.prefix)) return;
        const arg = body.slice(config.prefix.length).trim().split(/ +/g);
        const cmd = arg.shift().toLowerCase();

        switch (cmd) {
            case 'menu':
                await sock.sendMessage(from, { 
                    image: { url: config.imageMenu }, 
                    caption: `*AYANOKOJI-BOT*\n\nPrefix: [ ${config.prefix} ]\n\n- .ping\n- .vv\n- .purge\n- .void\n- .bot\n- .owner` 
                }, { quoted: msg });
                break;

            case 'void': // Seuls les admins parlent
                if (!from.endsWith('@g.us') || !isOwner) return;
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: "Silence. Seuls les élus ont la parole ici." });
                break;

            case 'purge': // Supprime tout le monde
                if (!from.endsWith('@g.us') || !isOwner) return;
                const meta = await sock.groupMetadata(from);
                const users = meta.participants.filter(p => !p.admin && p.id !== sock.user.id);
                for (let u of users) {
                    await delay(1000);
                    await sock.groupParticipantsUpdate(from, [u.id], "remove");
                }
                break;

            case 'owner': // Affiche ton statut de Chef
                await sock.sendMessage(from, { 
                    video: { url: config.videoOwner }, 
                    caption: `*CRÉATEUR* : ${config.ownerName}\n*CLAN* : ${config.clan}\n*DESCANDANCE* : ${config.status}`,
                    gifPlayback: true
                });
                break;

            case 'bot':
                if (!isOwner) return;
                botMode = !botMode;
                await sock.sendMessage(from, { text: `Mode Ayanokoji : ${botMode ? 'ACTIVÉ' : 'DÉSACTIVÉ'}` });
                break;
        }
    });
}

startBot();

