const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, downloadContentFromMessage, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const config = require('./config');
const app = express();

app.get('/', (req, res) => res.send('Ayanokoji Bot Is Active'));
app.listen(process.env.PORT || 3000);

let botMode = false; // Mode conversation froide

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Mac OS", "Safari", "10.15.7"],
        connectTimeoutMs: 60000
    });

    if (!sock.authState.creds.registered) {
        await delay(5000);
        let code = await sock.requestPairingCode(config.ownerNumber.split('@')[0]);
        console.log(`\nCODE DE JUMELAGE : ${code}\n`);
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (up) => { if (up.connection === 'close') startBot(); });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const isOwner = sender.includes(config.ownerNumber.split('@')[0]);
        
        const type = Object.keys(msg.message)[0];
        const body = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : (type === 'imageMessage') ? msg.message.imageMessage.caption : '';
        
        // --- MODE BOT (CONVERSATION FROIDE) ---
        if (botMode && !isOwner && !body.startsWith(config.prefix)) {
            await delay(1000);
            return sock.sendMessage(from, { text: "Ne perds pas ton temps à me parler. Tu n'es qu'un outil parmi d'autres." });
        }

        if (!body.startsWith(config.prefix)) return;
        const arg = body.slice(config.prefix.length).trim().split(/ +/g);
        const cmd = arg.shift().toLowerCase();

        switch (cmd) {
            case 'menu':
                await sock.sendMessage(from, { 
                    image: { url: config.imageMenu }, 
                    caption: `*AYANOKOJI-BOT*\n\nPrefix: [ ${config.prefix} ]\n\n*COMMANDES :*\n- .ping\n- .vv (Anti Vue Unique)\n- .purge (Supprimer membres)\n- .void (Fermer le groupe)\n- .bot (Mode froid)\n- .owner (Créateur)` 
                }, { quoted: msg });
                break;

            case 'vv':
                const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted) return;
                const viewOnce = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message;
                const mType = Object.keys(viewOnce)[0];
                const media = viewOnce[mType];
                const stream = await downloadContentFromMessage(media, mType.replace('Message', ''));
                let buffer = Buffer.from([]);
                for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
                await sock.sendMessage(from, { [mType.replace('Message', '')]: buffer, caption: "Purifié." });
                break;

            case 'purge':
                if (!from.endsWith('@g.us') || !isOwner) return;
                const meta = await sock.groupMetadata(from);
                const users = meta.participants.filter(p => !p.admin && p.id !== sock.user.id);
                for (let u of users) {
                    await delay(500);
                    await sock.groupParticipantsUpdate(from, [u.id], "remove");
                }
                break;

            case 'void':
                if (!from.endsWith('@g.us') || !isOwner) return;
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: "Le groupe est maintenant sous silence. Seuls les élus parlent." });
                break;

            case 'bot':
                if (!isOwner) return;
                botMode = !botMode;
                await sock.sendMessage(from, { text: `Mode Ayanokoji : ${botMode ? 'ACTIF' : 'INACTIF'}` });
                break;

            case 'owner':
                await sock.sendMessage(from, { 
                    video: { url: config.videoOwner }, 
                    caption: `*PROPRIÉTAIRE* : ${config.ownerName}\n*CLAN* : ${config.clan}\n*STATUT* : ${config.status}`,
                    gifPlayback: true
                });
                break;

            case 'ping':
                await sock.sendMessage(from, { text: "Calcul terminé. Vitesse optimale." });
                break;
        }
    });
}

startBot();

