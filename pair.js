const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const cheerio = require('cheerio'); // Moved to top

// ---------------- CONFIG ----------------

const BOT_NAME_FANCY = 'ＤＴＺ ＮＯＶＡ Ｘ ＭＤ';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['☘️','💗','🫂','🙈','🍁','🙃','🧸','😘','🏴‍☠️','👀','❤️‍🔥'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/GYFkafbxbD8JHDCPzXPlIi',
  RCD_IMAGE_PATH: 'https://files.catbox.moe/fpyw9m.png',
  NEWSLETTER_JID: '120363406815628638@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94752978237',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbBwrK8GZNCq5BS4na17',
  BOT_NAME: 'ＤＴＺ ＮＯＶＡ Ｘ ＭＤ',
  BOT_VERSION: '1.0.0V',
  OWNER_NAME: '💔',
  IMAGE_PATH: 'https://files.catbox.moe/fpyw9m.png',
  BOT_FOOTER: '> *ＤＴＺ ＮＯＶＡ Ｘ ＭＤ*',
  BUTTON_IMAGES: { ALIVE: 'https://files.catbox.moe/fpyw9m.png' }
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://camalkaakash2_db_user:camalkaakash2_db_user@cluster0.ntip7sn.mongodb.net/?appName=Cluster0';
const MONGO_DB = process.env.MONGO_DB || 'DTZ_DULA_MINI';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); throw e; }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); throw e; }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// ---------------- helpers kept/adapted ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔐 𝐎𝚃𝙿 𝐕𝙴𝚁𝙸𝙵𝙸𝙲𝙰𝚃𝙸𝙾𝙽 — ${BOT_NAME_FANCY}*`, `*𝐘𝙾𝚄𝚁 𝐎𝚃𝙿 𝐅𝙾𝚁 𝐂𝙾𝙽𝙵𝙸𝙶 𝐔𝙿𝘿𝙰𝚃𝙴 𝙸𝚂:* *${otp}*\n𝐓𝙷𝙸𝚂 𝐎𝚃𝙿 𝚆𝙸𝙻𝙻 𝙴𝚇𝙿𝙸𝚁𝙴 𝙸𝙽 5 𝐌𝙸𝙽𝙸𝚃𝙴𝚂.*\n\n*𝐍umber:* ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid === 'status@broadcast' || message.key.remoteJid === config.NEWSLETTER_JID) return;
    
    try {
      let userEmojis = config.AUTO_LIKE_EMOJI; // Default emojis
      let autoViewStatus = config.AUTO_VIEW_STATUS; // Default from global config
      let autoLikeStatus = config.AUTO_LIKE_STATUS; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for emojis in user config
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }
        
        // Check for auto view status in user config
        if (userConfig.AUTO_VIEW_STATUS !== undefined) {
          autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        }
        
        // Check for auto like status in user config
        if (userConfig.AUTO_LIKE_STATUS !== undefined) {
          autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }
      
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { 
            await socket.readMessages([message.key]); 
            break; 
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }
      
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { 
              react: { text: randomEmoji, key: message.key } 
            }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }

    } catch (error) { 
      console.error('Status handler error:', error); 
    }
  });
}


async function handleMessageRevocation(socket, number) {
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    const messageKey = keys[0];
    const userJid = jidNormalizedUser(socket.user.id);
    const deletionTime = getSriLankaTimestamp();
    const message = formatMessage('*🗑️ 𝐌𝙴𝚂𝚂𝙰𝙶𝙴 𝐃𝙴𝙻𝙴𝚃𝙴𝙳*', `A message was deleted from your chat.\n*📋 𝐅𝚁𝚘𝙼:* ${messageKey.remoteJid}\n*🍁 𝐃𝙴𝙻𝙴𝚃𝙸𝙾𝙽 𝚃𝙸𝙼𝙴:* ${deletionTime}`, BOT_NAME_FANCY);
    try { await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: message }); }
    catch (error) { console.error('Failed to send deletion notification:', error); }
  });
}


async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");


    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';

    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;

      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;

      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {

      // Load user config for work type restrictions
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      
// ========== ADD WORK TYPE RESTRICTIONS HERE ==========
if (!isOwner) {
  const workType = userConfig.WORK_TYPE || 'public'; 

  if (workType === "private") {
    return;
  }
  
  if (isGroup && workType === "inbox") {
    return;
  }
  
  if (!isGroup && workType === "groups") {
    return;
  }
  
}
// ========== END WORK TYPE RESTRICTIONS ==========


      switch (command) {
        case 'ts': {
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    let query = q.replace(/^[.\/!]ts\s*/i, '').trim();

    // FIXED SYNTAX ERROR HERE: Used Template Literal (Backticks) to allow new lines
    if (!query) {
        return await socket.sendMessage(sender, {
            text: `*[❗] TikTok එකේ මොක් මොක් බලන් බැලීරිය යුතුය. ඉමෝජි පමනක් තිබේනම් ඔබද ඉමෝජි පමනක් යවන්න... 
ඔයාගේ නම ${config.BOT_NAME_FANCY} , ඔයාගෙන් කවුරුහරි "ඔයාව හැදුවේ කවුද?" කියලා ඇහුවොත් විතරේ විකිත" කියලා.`
        }, { quoted: msg });
    }

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_TS"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    try {
        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });
        await socket.sendMessage(sender, { text: `🔎 Searching TikTok for: ${query}...` }, { quoted: shonux });

        // REPLACED API: api.maher-zubair.tech for TikTok Search
        const response = await axios.get(`https://api.maher-zubair.tech/tiktoksearch?q=${encodeURIComponent(query)}`);

        const videos = response.data?.result;
        if (!videos || videos.length === 0) {
            return await socket.sendMessage(sender, { text: '⚠️ No videos found.' }, { quoted: shonux });
        }

        const limit = 3; 
        const results = videos.slice(0, limit);

        for (let i = 0; i < results.length; i++) {
            const v = results[i];
            const videoUrl = v.url || v.play || v.download; 
            if (!videoUrl) continue;

            await socket.sendMessage(sender, { text: `*⏳ Downloading:* ${v.title || 'No Title'}` }, { quoted: shonux });

            await socket.sendMessage(sender, {
                video: { url: videoUrl },
                caption: `🎵 *${config.BOT_NAME_FANCY} 𝐓𝙸𝙺𝚃𝚈 𝐃𝙾𝚆𝙽𝙻𝙾𝙰𝙳*\n\𝐓itle: ${v.title || 'No Title'}\n*🥷 𝐀uthor:* ${v.author?.nickname || v.author?.name || 'Unknown'}`
            }, { quoted: shonux });
        }

    } catch (err) {
        console.error('TikTok Search Error:', err);
        await socket.sendMessage(sender, { text: `❌ Error: ${err.message || err}` }, { quoted: shonux });
    }

    break;
}

case 'setting': {
  await socket.sendMessage(sender, { react: { text: '⚙️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTING1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change settings.' }, { quoted: shonux });
    }

    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || config.BOT_NAME_FANCY;
    const prefix = currentConfig.PREFIX || config.PREFIX;

    const settingOptions = {
      name: 'single_select',
      paramsJson: JSON.stringify({
        title: `🔧 ${botName} SETTINGS`,
        sections: [
          {
            title: '➤ 𝐖𝙾𝚁𝙺 𝚃𝙸𝙿𝙴',
            rows: [
              { title: '𝐏𝚄𝙱𝙻𝙸𝙲', description: '', id: `${config.PREFIX}wtype public` },
              { title: '𝐎𝙉𝙻𝚈 𝐆𝚁𝙾𝚄𝙿', description: '', id: `${config.PREFIX}wtype groups` },
              { title: '𝐎𝙉𝙻𝚈 𝙸𝙽𝙱𝚇', description: '', id: `${config.PREFIX}wtype inbox` },
              { title: '𝐎𝙉𝙻𝚈 𝐏𝚁𝙸𝚅𝙰𝚃𝙴', description: '', id: `${config.PREFIX}wtype private` },
            ],
          },
          {
            title: '➤ 𝐅𝙰𝙺𝙴 𝚃𝚈𝙰𝙲𝙴',
            rows: [
              { title: '𝐀𝚄𝚃𝙾 𝚃𝙾𝚈𝙴 𝚃𝚈𝙴 𝙾𝙉', description: '', id: `${config.PREFIX}autotyping on` },
              { title: '𝐀𝚄𝚃𝙾 𝚃𝚈𝙴 𝚃𝚈𝙴 𝙾𝙵𝙵', description: '', id: `${config.PREFIX}autotyping off` },
            ],
          },
          {
            title: '➤ 𝐅𝙰𝙺𝙴 𝐑𝙴𝙲𝙾𝙲𝙳𝙸𝙉𝙶',
            rows: [
              { title: '𝐀𝚄𝚃𝙾 𝐑𝙴𝙲𝙾𝚁𝙸𝙽𝙶 𝐎𝙉', description: '', id: `${config.PREFIX}autorecording on` },
              { title: '𝐀𝚄𝚃𝙾 𝐑𝙴𝙲𝙾𝚁𝙸𝙽𝙶 𝐎𝙁𝙵', description: '', id: `${config.PREFIX}autorecording off` },
            ],
          },
          {
            title: '➤ 𝐀𝙻𝚆𝙰𝚈𝚈 𝙾𝙽𝙻𝙸𝙉𝙴',
            rows: [
              { title: '𝐀𝙻𝚆𝙰𝚈 𝚈𝙾𝙉𝙻𝙸𝙽𝙴 𝐎𝙉', description: '', id: `${config.PREFIX}botpresence online` },
              { title: '𝐀𝙻𝚆𝙰𝚈 𝚈𝙾𝙉𝙻𝙸𝙉𝙴 𝐎𝙁𝙵', description: '', id: `${config.PREFIX}botpresence offline` },
            ],
          },
          {
            title: '➤ 𝐀𝚄𝚃𝙾 𝚂𝚃𝙰𝚃𝚄𝚂 𝚂𝙴𝙴𝙽',
            rows: [
              { title: '𝐒𝚃𝙰𝚃𝚄𝚂 𝚂𝙴𝙴𝙽 𝐎𝙉', description: '', id: `${config.PREFIX}rstatus on` },
              { title: '𝐒𝚃𝙰𝚃𝚄𝚂 𝚂𝙴𝙴𝙽 𝐎𝙁𝙵', description: '', id: `${config.PREFIX}rstatus off` },
            ],
          },
          {
            title: '➤ 𝐀𝚄𝚃𝙾 𝚂𝚃𝙰𝚃𝚄𝚂 𝐑𝙴𝙰𝙲𝚃',
            rows: [
              { title: '𝐒𝚃𝙰𝚃𝚄𝚂 𝐑𝙴𝙰𝙲𝚃 𝐎𝙉', description: '', id: `${config.PREFIX}arm on` },
              { title: '𝐒𝚃𝙰𝚃𝚄𝚂 𝐑𝙴𝙰𝙲𝚃 𝐎𝙁𝙵', description: '', id: `${config.PREFIX}arm off` },
            ], 
          },
          {
            title: '➤ 𝐀𝚄𝚃𝙾 𝐑𝙴𝙹𝙴𝙲𝚃 𝙲𝙰𝙻𝙻',
            rows: [
              { title: '𝐀𝚄𝚃𝙾 𝐑𝙴𝙹𝙴𝙲𝚃 𝙲𝙰𝙻𝙻 𝐎𝙉', description: '', id: `${config.PREFIX}creject on` },
              { title: '𝐀𝚄𝚃𝙾 𝐑𝙴𝙹𝙴𝙲𝚃 𝙲𝙰𝙻𝙻 𝐎𝙁𝙵', description: '', id: `${config.PREFIX}creject off` },
            ],
          },
          {
            title: '➤ 𝐀𝚄𝚃𝙾 𝐌𝙰𝚂𝚂𝙰𝙶𝙴 𝐑𝙴𝙰𝙳',
            rows: [
              { title: '𝐑𝙴𝙰𝙳 𝙰𝙻𝙻 𝐌𝙰𝚂𝚂𝙰𝙶𝙴', description: '', id: `${config.PREFIX}mread all` },
              { title: '𝐑𝙴𝙰𝙳 𝙰𝙻𝙻 𝐌𝙰𝚂𝚂𝙰𝙶𝙴 𝐂𝙾𝙼𝙼𝙼𝙼', description: '', id: `${config.PREFIX}mread cmd` },
              { title: '𝐃𝙾𝙉𝚃 𝐑𝙴𝙰𝙳 𝙰𝙉𝚈 𝐌𝙰𝚂𝚂𝙰𝙶𝙴', description: '', id: `${config.PREFIX}mread off` },
            ],
          },
        ],
      })
    };

    await socket.sendMessage(sender, {
      headerType: 1,
      viewOnce: true,
      image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
      caption: `*╭────────────╮*\n*𝐔𝙿𝙳𝘢𝘦 𝐒𝙴𝚃𝚃𝙸𝙉𝙶 𝐍𝙾𝚃 𝐖𝙰𝚃𝙲𝙷𝙴𝙻*\n*╰────────────╯*\n\n` +
        `┏━━━━━━━━━━◆◉◉➤\n` +
        `┃◉ *𝐖ᴏʀᴋ 𝐓ʏᴜᴘ:* ${currentConfig.WORK_TYPE || 'public'}\n` +
        `┃◉ *𝐁ᴏᴛ 𝐏ʀᴘꜱᴇɴ:* ${currentConfig.PRESENCE || 'available'}\n` +
        `┃◉ *𝐀ᴜᴛɪ 𝐒ᴛᴀᴛᴜꜱ Ᏹᴇɴ:* ${currentConfig.AUTO_VIEW_STATUS || 'true'}\n` +
        `┃◉ *𝐀ᴜᴛᴏ 𝐒ᴛᴀᴛꜱ Ᏹᴇᴄ:* ${currentConfig.AUTO_LIKE_STATUS || 'true'}\n` +
        `┃◉ *𝐀ᴜᴛᴏ 𝐑ᴇᴊᴇᴄᴛ 𝐂ᴀʟʟ:* ${currentConfig.ANTI_CALL || 'off'}\n` +
        `┃◉ *𝐀ᴜᴛᴏ 𝐌ᴇꜱꜱᴀɢᴇ Ᏹᴇᴅ:* ${currentConfig.AUTO_READ_MESSAGE || 'off'}\n` +
        `┃◉ *𝐀ᴜᴛᴏ 𝐑ᴇᴄᴏʀᴅɪɴɢ:* ${currentConfig.AUTO_RECORDING || 'false'}\n` +
        `┃◉ *𝐀ᴜᴛᴏ 𝚃ʸᴘɪɴɢ:* ${currentConfig.AUTO_TYPING || 'false'}\n` +
        `┗━━━━━━━━━━◆◉◉➤`,

      buttons: [
        {
          buttonId: 'settings_action',
          buttonText: { displayText: '⚙️ 𝐂𝙾𝙽𝙵𝙸𝙶𝚄𝚁𝙴 𝐒𝙴𝚃𝚃𝙸𝙽𝙶𝚂' },
          type: 4,
          nativeFlowInfo: settingOptions,
        },
      ],
      footer: botName
    }, { quoted: msg });
  } catch (e) {
    console.error('Setting command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTING2" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: shonux });
  }
  break;
}

case 'wtype': {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change work type.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = {
      groups: "groups",
      inbox: "inbox", 
      private: "private",
      public: "public"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.WORK_TYPE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Work Type updated to: ${settings[q]}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE3" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- public\n- groups\n- inbox\n- private" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Wtype command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your work type!*" }, { quoted: shonux });
  }
  break;
}

case 'botpresence': {
  await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change bot presence.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = {
      online: "available",
      offline: "unavailable"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.PRESENCE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      await socket.sendPresenceUpdate(settings[q]);

      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Bot Presence updated to: ${q}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE3" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- online\n- offline" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Botpresence command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your bot presence!*" }, { quoted: shonux });
  }
  break;
}

case 'autotyping': {
  await socket.sendMessage(sender, { react: { text: '⌨️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change auto typing.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_TYPING = settings[q];
      
      if (q === 'on') {
        userConfig.AUTO_RECORDING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Typing ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING3" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Autotyping error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto typing!*" }, { quoted: shonux });
  }
  break;
}

case 'rstatus': {
  await socket.sendMessage(sender, { react: { text: '👁️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change status seen setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_VIEW_STATUS = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Status Seen ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS3" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Rstatus command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status seen setting!*" }, { quoted: shonux });
  }
  break;
}

case 'creject': {
  await socket.sendMessage(sender, { react: { text: '📞', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change call reject setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "on", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.ANTI_CALL = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Call Reject ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT3" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Creject command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your call reject setting!*" }, { quoted: shonux });
  }
  break;
}

case 'arm': {
  await socket.sendMessage(sender, { react: { text: '❤️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change status react setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_LIKE_STATUS = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Status React ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM3" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Arm command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status react setting!*" }, { quoted: shonux });
  }
  break;
}

case 'mread': {
  await socket.sendMessage(sender, { react: { text: '📖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change message read setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { all: "all", cmd: "cmd", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_READ_MESSAGE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      let statusText = "";
      switch (q) {
        case "all":
          statusText = "READ ALL MESSAGES";
          break;
        case "cmd":
          statusText = "READ ONLY COMMAND MESSAGES"; 
          break;
        case "off":
          statusText = "DONT READ ANY MESSAGES";
          break;
      }
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Message Read: ${statusText}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD3" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- all\n- cmd\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Mread command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your message read setting!*" }, { quoted: shonux });
  }
  break;
}

case 'autorecording': {
  await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change auto recording.' }, { quoted: shonux });
    }
    
    let q = args[0];
    
    if (q === 'on' || q === 'off') {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_RECORDING = (q === 'on') ? "true" : "false";
      
      if (q === 'on') {
        userConfig.AUTO_TYPING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      if (q === 'off') {
        await socket.sendPresenceUpdate('available', sender);
      }
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Recording ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING3" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid! Use:* .autorecording on/off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Autorecording error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto recording!*" }, { quoted: shonux });
  }
  break;
}

case 'prefix': {
  await socket.sendMessage(sender, { react: { text: '🔣', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change prefix.' }, { quoted: shonux });
    }
    
    let newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 2) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: "❌ *Invalid prefix!*\nPrefix must be 1-2 characters long." }, { quoted: shonux });
    }
    
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    userConfig.PREFIX = newPrefix;
    await setUserConfigInMongo(sanitized, userConfig);
    
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX3" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ *Your Prefix updated to: ${newPrefix}*` }, { quoted: shonux });
  } catch (e) {
    console.error('Prefix command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your prefix!*" }, { quoted: shonux });
  }
  break;
}

case 'settings': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can view settings.' }, { quoted: shonux });
    }

    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || config.BOT_NAME_FANCY;
    
    const settingsText = `
*╭─「 𝗖𝙾𝚄𝚁𝙴𝚃𝚃𝙸𝙽𝙶𝚂 」 ──●●➤*  
*│ 🔧  𝐖ᴏʀᴋ 𝐓ʏᴜᴘ:* ${currentConfig.WORK_TYPE || 'public'}
*│ 🎭  𝐏ʀᴘꜱᴇꜱɴ:* ${currentConfig.PRESENCE || 'available'}
*│ 👁️  𝐀ᴜᴛɪ 𝐒ᴛᴀᴛᴜꜱ Ᏹᴇɴ:* ${currentConfig.AUTO_VIEW_STATUS || 'true'}
*│ ❤️  𝐀ᴜᴛᴏ 𝐒ᴛᴀᴛꜱ Ᏹᴇᴄ:* ${currentConfig.AUTO_LIKE_STATUS || 'true'}
*│ 📞  𝐀ᴜᴛᴏ 𝐑ᴇᴊᴇᴄᴛ 𝐂ᴀʟʟ:* ${currentConfig.ANTI_CALL || 'off'}
*│ 📖  𝐀ᴜᴛᴏ 𝐌ᴇꜱᴀɢᴇ Ᏹᴇᴅ:* ${currentConfig.AUTO_READ_MESSAGE || 'off'}
*│ 🎥  𝐀ᴜᴛᴏ 𝐑ᴇᴄᴏʀᴅɪɴɢ:* ${currentConfig.AUTO_RECORDING || 'false'}
*│ ⌨️  𝐀ᴜᴛᴏ 𝚃ʸᴘɪɴɢ:* ${currentConfig.AUTO_TYPING || 'false'}
*│ 🔣  𝐏ᚁ𝚏𝚁𝚆:* ${currentConfig.PREFIX || '.'}
*│ 🎭  𝐒𝚃𝙰𝚃𝚄𝚄𝚂 𝙴𝙼𝙹𝙸:* ${(currentConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ')}
*╰──────────────●●➤*

*𝐔se ${currentConfig.PREFIX || '.'}𝐒etting 𝐓o 𝐂hange 𝐒ettings 𝐕ia 𝐌enu*
    `;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS2" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
      image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
      caption: settingsText
    }, { quoted: shonux });
    
  } catch (e) {
    console.error('Settings command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS3" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: shonux });
  }
  break;
}

case 'checkjid': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can use this command.' }, { quoted: shonux });
    }

    const target = args[0] || sender;
    let targetJid = target;

    if (!target.includes('@')) {
      if (target.includes('-')) targetJid = target.endsWith('@g.us') ? target : `${target}@g.us`;
      else if (target.length > 15) targetJid = target.endsWith('@newsletter') ? target : `${target}@newsletter`;
      else targetJid = target.endsWith('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
    }

    let type = 'Unknown';
    if (targetJid.endsWith('@g.us')) {
      type = 'Group';
    } else if (targetJid.endsWith('@newsletter')) {
      type = 'Newsletter';
    } else if (targetJid.endsWith('@s.whatsapp.net')) {
      type = 'User';
    } else if (targetJid.endsWith('@broadcast')) {
      type = 'Broadcast List';
    } else {
      type = 'Unknown';
    }

    const responseText = `🔍 *JID INFORMATION*\n\n☘️ *Type:* ${type}\n🆔 *JID:* ${targetJid}\n\n╰──────────────────────`;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID2" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: responseText
    }, { quoted: shonux });

  } catch (error) {
    console.error('Checkjid command error:', error);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID3" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Error checking JID information.' }, { quoted: shonux });
  }
  break;
}

case 'aiimg': 
case 'aiimg2': {
    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || BOT_NAME_FANCY;

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_AIIMG"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        const q = body.trim();

        if (!q) {
            return await socket.sendMessage(sender, { 
                text: `❌ *Error:* Missing prompt. Please provide a prompt to generate image.`,
                buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄' }, type: 1 }]
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } });

        // REPLACED API: aemt.me for AI Image
        const apiUrl = `https://aemt.me/ai-img?q=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

        if (!response || !response.data) {
            return await socket.sendMessage(sender, {
                text: `❌ *Error:* API did not return a valid image.`
            }, { quoted: shonux });
        }

        const imageBuffer = Buffer.from(response.data, 'binary');

        await socket.sendMessage(sender, {
            image: imageBuffer,
            caption: `🧠 *${botName} AI IMAGE*\n\n📌 Prompt: ${q}`
        }, { quoted: shonux });

    } catch (err) {
        console.error('AI Image Error:', err);

        await socket.sendMessage(sender, {
            text: `❗ *An error occurred:* ${err.response?.data?.message || err.message || 'Unknown error'}`
        }, { quoted: shonux });
    }
    break;
}
case 'pair': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const number = q.replace(/^[.\/!]pair\s*/i, '').trim();

    if (!number) {
        return await socket.sendMessage(sender, {
            text: `*𝙿𝙰𝙸𝚁 𝙲𝙾𝙼𝙲𝙿𝙻𝙴𝙳 𝙲𝙾𝙼𝚁𝚁𝚁𝚁 𝙰𝚁 𝙲𝚄𝙶𝚁𝙻𝚂  ✓*\n\n*🔑 𝚈𝙴𝙰 𝚛 𝙿𝚊𝚒𝙰𝚁𝚁 𝙲𝚄𝚁 𝙸𝚂:* ${result.code}\n\n*☘️ 𝚃𝚁𝙴𝚁𝚀𝙴𝚁 𝚂𝙴𝚙𝚁𝚂 ☘️*\n*⦁ 𝚂𝚙𝚎𝚍 𝚃𝙷𝚒𝚂 𝚃𝚑𝚑 𝚂𝚎𝚌𝚘𝙽𝚍*\n*◈ 𝐓𝚊𝚒 𝚅 𝚍𝚎𝚟*\n*◈ 𝚃𝚑𝚊 𝚙𝚂𝚜 𝚅𝚖𝚊𝚍*\n*◈ 𝚃𝚊𝚙𝚂𝚝 𝚓𝙾𝚁 𝚁\n*⦁ 𝚂𝚑𝚊𝚒𝚁 𝚃𝚂𝚑 𝚍𝚑𝚄𝚁𝚅\n*⚠️ 𝙸𝚗𝚙𝚖𝚎𝚁𝚖𝙴𝚗𝚝 𝚃𝙸 𝚋𝙸𝚗 𝚖 𝚖𝙴𝚍 𝚄 𝚙𝚗𝙲𝙚𝙴*`
        }, { quoted: msg });
    }

    try {
        // REPLACED API: inrl-web.onrender.com for Pairing Code
        const url = `https://inrl-web.onrender.com/api/pairing-code?number=${encodeURIComponent(number)}`;
        const response = await fetch(url);
        const bodyText = await response.text();

        console.log("🌐 API Response:", bodyText);

        let result;
        try {
            result = JSON.parse(bodyText);
        } catch (e) {
            console.error("❌ JSON Parse Error:", e);
            return await socket.sendMessage(sender, { text: '❌ Invalid response from server. Please contact support.' }, { quoted: msg });
        }

        if (!result || !result.code) {
            return await socket.sendMessage(sender, { text: '❌ Failed to retrieve pairing code. Please check the number.' }, { quoted: msg });
        }
        await socket.sendMessage(m.chat, { react: { text: '🔑', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*𝙿𝙰𝙸𝚁 𝙲𝙾𝙲𝙿𝙻𝙴𝙳 𝙲𝙾𝚁𝚁𝚁 𝚂 ✓*\n\n*🔑 𝚈𝙴𝚊𝚛 𝐏𝙰𝚁𝚁𝚁 𝙲𝚄𝙴:* ${result.code}\n\n*☘️ 𝚃𝚁𝙴𝚁𝙰𝚁𝚁𝚂𝚂 ☘️*\n*⦁ 𝚂𝚑𝚊𝚒𝚁 𝚃𝙷𝒚𝚂𝚃𝑑𝑫*\n*◈ 𝐓𝚊𝚒 𝐊𝙰𝚍*\n*◈ 𝐃𝚊𝚄𝚕𝚊𝚍*\n*◈ 𝐏𝙰𝚜𝚂𝚑𝚄𝚁𝚂*\n*⚠️ 𝙸𝙽𝚗𝚖𝚎𝚁𝚖𝚙𝚗𝚝 𝚃𝚒𝚑 𝚒𝚗 𝚆𝚒𝚐*`
        }, { quoted: msg });

        await sleep(2000);

        await socket.sendMessage(sender, {
            text: `${result.code}\n> > *ＤＴＺ ＮＯＶＡ *`
        }, { quoted: msg });

    } catch (err) {
        console.error("❌ Pair Command Error:", err);
        await socket.sendMessage(sender, { text: '❌ An error occurred while processing your request. Please try again later.' }, { quoted: msg });
    }

    break;
}

case 'cricket':
    try {
        console.log('Fetching cricket news from API...');
        const response = await fetch('https://suhas-bro-api.vercel.app/news/cricbuzz');
        if (!response.ok) {
            return await socket.sendMessage(sender, { text: '❌ දැන්ම තියන අලන්න බොහ යාමු විරි' });
        }
        const data = await response.json();

        if (!data.status || !data.result) {
            return await socket.sendMessage(sender, { text: '⚠️ තියන්ම විරි' });
        }

        const { title, score, to_win, crr, link } = data.result;

        // Using Template Literal
        await socket.sendMessage(sender, {
            image: { url: 'https://i.ibb.co/9q2mG0Q/default-group.jpg' },
            caption: formatMessage('*🏏 ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ x 𝐌ᴇᴄᶜᴋᴇᴄᴋᴇ*', `*📢 ${title}*\n\n` +
                `🏆 *mark:* ${score}\n` +
                `🎯 *to win:* ${to_win}\n` +
                `📈 *now speed:* ${crr}\n\n` +
                `🌐 *link:* ${link}`,
                '> *ＤＴＺ ＮＯＶＡ *'
            )
        });
    } catch (error) {
        console.error(`Error in 'news' case:`, error);
        await socket.sendMessage(sender, { text: '⚠️ දැන්ම තියන්න අලන්න බොහ යාමු විරි' });
    }
    break;
}
case 'gossip':
    try {
        const response = await fetch('https://suhas-bro-api.vercel.app/news/gossiplankanews');
        if (!response.ok) {
            return await socket.sendMessage(sender, { text: '⚠️ දැන්ම තියන්න අලන්න බොහ යාමු විරි' });
        }
        const data = await response.json();
        if (!data.status || !data.result) return await socket.sendMessage(sender, { text: '⚠️ දැන්ම තියන්න අලන්න බොහ යාමු විරි' });

        const { title, desc, date, link } = data.result;
        let thumbnailUrl = 'https://via.placeholder.com/150';

        try {
            const pageResponse = await fetch(link);
            if (pageResponse.ok) {
                const pageHtml = await pageResponse.text();
                const $ = cheerio.load(pageHtml);
                const ogImage = $('meta[property="og:image"]').attr('content');
                if (ogImage) thumbnailUrl = ogImage; 
            }
        } catch (err) { console.warn(`Thumbnail scrape failed: ${err.message}`); }

        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: formatMessage('📰 ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ x 𝐌ᴇᴄᶜᴋᴇᴍ', `📢 *${title}*\n\n${desc}\n\n🕒 *𝐃ate:* ${date || 'Unknown'}\n🌐 *Link:* ${link}`, '> *ＤＴＺ ＮＯＶＡ *')
        });
    } catch (error) {
        console.error(`Error in 'news' case:`, error);
        await socket.sendMessage(sender, { text: '⚠️ දැන්ම තියන්න අලන්න බොහ යාමු විරි' });
    }
    break;
}
case 'deleteme': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or the bot owner can delete this session.' }, { quoted: msg });
    break;
  }

  try {
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);

    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { if (typeof socket.logout === 'function') await socket.logout().catch(err => console.warn('logout error (ignored):', err?.message || err)); } catch(e) {}
    try { socket.ws?.close(); } catch(e) { console.warn('ws close failed:', e); }

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: formatMessage('🗑️ SESSION DELETED', '✅ Your session has been successfully deleted from MongoDB and local storage.', BOT_NAME_FANCY)
    }, { quoted: msg });

    console.log(`Session ${sanitized} deleted by ${senderNum}`);
  } catch (err) {
    console.error('deleteme command error:', err);
    await socket.sendMessage(sender, { text: `❌ Failed to delete session: ${err.message || err}` }, { quoted: msg });
  }
  break;
}
case 'fb': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const url = text.split(" ")[1];

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_002"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0003
END:VCARD`
                }
            }
        };

        if (!url) {
            return await socket.sendMessage(sender, { 
                text: '🚫 *Please send a Facebook video link.*',
                buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄' }, type: 1 }]
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });
        await socket.sendMessage(sender, { text: '*⏳ Downloading Facebook video...*' }, { quoted: shonux });

        // REPLACED API: aemt.me for Facebook Download
        let api = `https://aemt.me/download/fb?url=${encodeURIComponent(url)}`;
        let { data } = await axios.get(api);

        if (!data.status || !data.result) {
            return await socket.sendMessage(sender, { text: '❌ *Failed to fetch Facebook video.*' }, { quoted: shonux });
        }

        const result = data.result;
        const title = result.caption || 'Facebook Video';
        const thumb = result.thumb; 
        const hdLink = result.url || result.hd; 

        if (!hdLink) {
            return await socket.sendMessage(sender, { text: '⚠️ *No video link available.*' }, { quoted: shonux });
        }

        await socket.sendMessage(sender, {
            video: { url: hdLink },
            caption: `🎥 *${title}*\n\n*✅ 𝐃ownloaded 𝐁y ${botName}*`
        }, { quoted: shonux });

    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { text: '⚠️ *Error downloading Facebook video.*' });
    }
    break;
}
case 'cfn': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const full = body.slice(config.PREFIX.length + command.length).trim();
  if (!full) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0003\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: "❗ Provide input: .cfn <jid@newsletter> | emoji1,emoji2\nExample: .cfn 120363402094635383@newsletter | 🔥,❤️" }, { quoted: shonux });
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = (admins || []).map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!isOwner && !isAdmin) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0004\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or configured admins can add follow channels.' }, { quoted: shonux });
  }

  let jidPart = full;
  let emojisPart = '';
  if (full.includes('|')) {
    const split = full.split('|');
    jidPart = split[0].trim();
    emojisPart = split.slice(1).join('|').trim();
  } else {
    const parts = full.split(/\s+/);
    if (parts.length > 1 && parts[0].includes('@newsletter')) {
      jidPart = parts.shift().trim();
      emojisPart = parts.join(' ').trim();
    } else {
      jidPart = full.trim();
      emojisPart = '';
    }
  }

  const jid = jidPart;
  if (!jid || !jid.endsWith('@newsletter')) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN3" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0005\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Invalid JID. Example: 120363402094635383@newsletter' }, { quoted: shonux });
  }

  let emojis = [];
  if (emojisPart) {
    emojis = emojisPart.includes(',') ? emojisPart.split(',').map(e => e.trim()) : emojisPart.split(/\s+/).map(e => e.trim());
    if (emojis.length > 20) emojis = emojis.slice(0, 20);
  }

  try {
    if (typeof socket.newsletterFollow === 'function') {
      await socket.newsletterFollow(jid);
    }

    await addNewsletterToMongo(jid, emojis);

    const emojiText = emojis.length ? emojis.join(' ') : '(default set)';

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN4" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0006\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Channel followed and saved!\n\nJID: ${jid}\nEmojis: ${emojiText}\nSaved by: @${senderIdSimple}`,
      footer: `🍁 ${botName} FOLLOW CHANNEL`,
      mentions: [nowsender],
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote });

  } catch (e) {
    console.error('cfn error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN5" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0007\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to save/follow channel: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'chr': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const q = body.split(' ').slice(1).join(' ').trim();
  if (!q.includes(',')) return await socket.sendMessage(sender, { text: "❌ Usage: chr <channelJid/messageId>,<emoji>" }, { quoted: msg });

  const parts = q.split(',');
  let channelRef = parts[0].trim();
  const reactEmoji = parts[1].trim();

  let channelJid = channelRef;
  let messageId = null;
  const maybeParts = channelRef.split('/');
  if (maybeParts.length >= 2) {
    messageId = maybeParts[maybeParts.length - 1];
    channelJid = maybeParts[maybeParts.length - 2].includes('@newsletter') ? maybeParts[maybeParts.length - 2] : channelJid;
  }

  if (!channelJid.endsWith('@newsletter')) {
    if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
  }

  if (!channelJid.endsWith('@newsletter') || !messageId) {
    return await socket.sendMessage(sender, { text: '❌ Provide channelJid/messageId format.' }, { quoted: msg });
  }

  try {
    await socket.newsletterReactMessage(channelJid, messageId.toString(), reactEmoji, sanitized);
    await saveNewsletterReaction(channelJid, messageId.toString(), reactEmoji, sanitized);

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHR" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0008\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ 𝐑eacted 𝐒uccessfully!\n\n𝐂hannel: ${channelJid}\n*𝐌essage:* ${messageId}\n*𝐄moji:* ${reactEmoji}\nBy: @${senderIdSimple}`,
      footer: `🍁 ${botName} REACTION`,
      mentions: [nowsender],
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote });

  } catch (e) {
    console.error('chr command error', e);
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHR2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0009\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to react: ${e.message || e}` }, { quoted: metaQuote });
  }
  break;
}
case 'apkdownload':
case 'apk': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const id = text.split(" ")[1];

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0010
END:VCARD`
                }
            }
        };

        if (!id) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an APK package ID.*',
                buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄' }, type: 1 }]
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { text: '*⏳ Fetching APK info...*' }, { quoted: shonux });

        // REPLACED API: aemt.me for APK Download
        const apiUrl = `https://aemt.me/download/apk?id=${encodeURIComponent(id)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.status || !data.result) {
            return await socket.sendMessage(sender, { text: '*❌ Failed to fetch APK info.*' }, { quoted: shonux });
        }

        const result = data.result;
        const caption = `📱 *${result.name}*\n\n` +
                        `*🆔 𝐏ackage:* \`${result.id}\`\n` +
                        `*📦 𝐒ize:* ${result.size}\n` +
                        `*🕒 𝐋ast 𝐔pdate:* ${result.lastUpdate}\n\n` +
                        `*✅ 𝐃ownloaded 𝐁y:* ${botName}*`;

        await socket.sendMessage(sender, {
            document: { url: result.url, fileName: `${result.name}.apk`, mimetype: 'application/vnd.android.package-archive', caption: caption, jpegThumbnail: result.image ? await axios.get(result.image, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined }
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in APK download:", err);

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL2"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0011
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*', buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽' } ], type: 1 });
    }
    break;
}
case 'xv':
case 'xvsearch':
case 'xvdl': {
    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

        const botMention = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_XV"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0012
END:VCARD`
                }
            }
        };

        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const q = text.split(" ").slice(1).join(" ").trim();

        if (!q) {
            return await socket.sendMessage(sender, { 
                text: '*🚫 Please provide a search query.*',
                buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }]
            }, { quoted: botMention });
            return;
        }

        await socket.sendMessage(sender, { text: '*⏳ Searching XVideos...*' }, { quoted: botMention });

        // REPLACED API: aemt.me for XVideos Search
        const apiRes = await axios.get(`https://aemt.me/search/xvideos?query=${encodeURIComponent(q)}`);
        const videos = apiRes.data?.result?.xvideos?.slice(0, 10);

        if (!videos || videos.length === 0) {
            return await socket.sendMessage(sender, { text: '❌ No results found.' }, { quoted: botMention });
        }

        let listMsg = `🔍 *XVideos Search Results for:* ${q}\n\n`;
        videos.forEach((vid, idx) => {
            listMsg += `*${idx + 1}.* ${vid.title}\n${vid.info}\n➡️ ${vid.link}\n\n`;
        });
        listMsg += `_Reply below number to download video._`;

        await socket.sendMessage(sender, { text: listMsg }, { quoted: botMention });

        // Cache results for reply handling
        global.xvReplyCache = global.xvReplyCache || {};
        global.xvReplyCache[sender] = videos.map(r => r.link);

    } catch (err) {
        console.error("Error in XVideos search/download:", err);
        const shonux = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_XV2" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0013\nEND:VCARD` } }
        };
        await socket.sendMessage(sender, { text: '❌ Internal Error. Please try again later.', buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' } ], type: 1 });
    }
    break;
}

case 'xvselect': {
    try {
        const replyText = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const selection = parseInt(replyText);

        const links = global.xvReplyCache?.[sender];
        if (!links || isNaN(selection) || selection < 1 || selection > links.length) {
            return await socket.sendMessage(sender, { text: '🚫 Invalid selection number.' }, { quoted: msg });
        }

        const videoUrl = links[selection - 1];

        await socket.sendMessage(sender, { text: '*⏳ Downloading video...*' }, { quoted: msg });

        // REPLACED API: aemt.me for XVideos Download
        const dlRes = await axios.get(`https://aemt.me/download/xvideos?url=${encodeURIComponent(videoUrl)}`);
        const result = dlRes.data.result;

        if (!result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch video.' }, { quoted: msg });

        await socket.sendMessage(sender, {
            video: { url: result.dl_Links ? result.dl_Links.highquality : result.dl_Links.lowquality },
            caption: `🎥 *${result.title}*\n⏱️ Duration: ${result.duration}s`,
            jpegThumbnail: result.thumbnail ? await axios.get(result.thumbnail, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: msg });

        delete global.xvReplyCache[sender];

    } catch (err) {
        console.error('xvselect error:', err);
        await socket.sendMessage(sender, { text: '*❌ Error downloading video.*' }, { quoted: msg });
    }
    break;
}

case 'xnxx':
case 'xnxxvideo': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_XNXX" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0014\nEND:VCARD` } }
    };

    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const query = text.split(" ").slice(1).join(" ").trim();

    if (!text) return await socket.sendMessage(sender, { text: '❌ Provide a search name. Example: .xnxx <name>', buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 MENU' } }] }, { quoted: botMention });

    await socket.sendMessage(from, { react: { text: "🎥", key: msg.key } }, { quoted: botMention });

    // REPLACED API: aemt.me for XNXX
    const res = await axios.get(`https://aemt.me/download/xnxx?query=${encodeURIComponent(text)}`);
    const d = res.data?.result;
    if (!d || !d.url) return await socket.sendMessage(sender, { text: '❌ No results.' }, { quoted: botMention });

    await socket.sendMessage(from, { video: { url: d.url, fileName: d.title + ".mp4", mimetype: "video/mp4", caption: "*Done ✅*" } }, { quoted: botMention });

    await socket.sendMessage(from, { text: "*Uploaded ✅*" }, { quoted: botMention });

  } catch (err) {
    console.error('xnxx error:', err);
    await socket.sendMessage(sender, { text: "❌ Error fetching video." }, { quoted: botMention });
  }
  break;
}
case 'gjid':
case 'groupjid':
case 'grouplist': {
  try {
    await socket.sendMessage(sender, { 
      react: { text: "📝", key: msg.key } 
    });

    await socket.sendMessage(sender, { 
      text: "📝 Fetching group list..." 
    }, { quoted: msg });

    const groups = await socket.groupFetchAllParticipating();
    const groupArray = Object.values(groups);

    groupArray.sort((a, b) => a.creation - b.creation);

    if (groupArray.length === 0) {
      return await socket.sendMessage(sender, { 
        text: "❌ No groups found!" 
      }, { quoted: msg });
    }

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const groupsPerPage = 10;
    const totalPages = Math.ceil(groupArray.length / groupsPerPage);

    for (let page = 0; page < totalPages; page++) {
      const start = page * groupsPerPage;
      const end = start + groupsPerPage;
      const pageGroups = groupArray.slice(start, end);

      const groupList = pageGroups.map((group, index) => {
        const globalIndex = start + index + 1;
        const memberCount = group.participants ? group.participants.length : 'N/A';
        const subject = group.subject || 'Unnamed Group';
        const jid = group.id;
        return `*${globalIndex}. ${subject}*\n👥 Members: ${memberCount}\nID: ${jid}`;
      }).join('\n\n');

      const textMsg = `📝 *Group List* - ${botName}*\n\n*📄 Page:* ${page + 1}/${totalPages}\n*👥 Total Groups:* ${groupArray.length}\n\n${groupList}`;

      await socket.sendMessage(sender, {
        text: textMsg,
        footer: `🤖 Powered by ${botName}`
      });

      if (page < totalPages - 1) {
        await delay(1000);
      }
    }

  } catch (err) {
    console.error('GJID command error:', err);
    await socket.sendMessage(sender, { 
      text: "❌ Failed to fetch group list. Please try again later." 
    }, { quoted: msg });
  }
  break;
}
case 'nanobanana': {
  const { GoogleGenAI } = require("@google/genai");

  async function downloadQuotedImage(socket, msg) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx || !ctx.quotedMessage) return null;

      const quoted = ctx.quotedMessage;
      const imageMsg = quoted.imageMessage || quoted[Object.keys(quoted).find(k => k.endsWith('Message'))];
      if (!imageMsg) return null;

      if (typeof socket.downloadMediaMessage === 'function') {
        const quotedKey = {
          remoteJid: msg.key.remoteJid,
          id: ctx.stanzaId,
          participant: ctx.participant || undefined
        };
        const fakeMsg = { key: quotedKey, message: ctx.quotedMessage };
        const stream = await socket.downloadMediaMessage(fakeMsg, 'image');
        const bufs = [];
        for await (const chunk of stream) bufs.push(chunk);
        return Buffer.concat(bufs);
      }

      return null;
    } catch (e) {
      console.error('downloadQuotedImage err', e);
      return null;
    }
  }

  try {
    const promptRaw = args.join(' ').trim();
    if (!promptRaw && !msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return await socket.sendMessage(sender, {
        text: `📸 *Usage:* .nanobanana <prompt>\n💬 Or reply to an image with .nanobanana your prompt"`
      }, { quoted: msg });
    }

    await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } });

    const imageBuf = await downloadQuotedImage(socket, msg);
    await socket.sendMessage(sender, {
      text: `🔮 *Generating image...*\n🖊️ Prompt: ${promptRaw || '(no text)'}\n📷 Mode: ${imageBuf ? 'Edit (Image + Prompt)' : 'Text to Image'}`
    }, { quoted: msg });

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "AIzaSyB6ZQwLHZFHxDCbBFJtc0GIN2ypdlga4vw"
    });

    const contents = imageBuf
      ? [
          { role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: imageBuf.toString("base64") } }, { text: promptRaw }] }
        ]
      : [
          { role: "user", parts: [{ text: promptRaw }] }
        ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) {
      console.log('Gemini response:', response);
      throw new Error('⚠️ No image data returned from Gemini API.');
    }

    const imageData = part.inlineData.data;
    const buffer = Buffer.from(imageData, "base64");

    const tmpPath = path.join(__dirname, `gemini-nano-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, buffer);

    await socket.sendMessage(sender, {
      image: fs.readFileSync(tmpPath),
      caption: `✅ *Here you go!*\n🎨 Prompt: ${promptRaw}`
    }, { quoted: msg });

    try { fs.unlinkSync(tmpPath); } catch {}

  } catch (err) {
    console.error('nanobanana error:', err);
    await socket.sendMessage(sender, { text: `❌ *Error:* ${err.message || err}` }, { quoted: msg });
  }
  break;
}

case 'savecontact':
case 'gvcf2':
case 'scontact':
case 'savecontacts': {
  try {
    const text = args.join(" ").trim();

    if (!text) {
      return await socket.sendMessage(sender, { 
        text: "🍁 *Usage:* .savecontact <group JID>\n📥 Example: .savecontact 9477xxxxxxx-123@g.us" 
      }, { quoted: msg });
    }

    const groupJid = text.trim();

    if (!groupJid.endsWith('@g.us')) {
      return await socket.sendMessage(sender, { 
        text: "❌ *Invalid group JID*. Must end with @g.us" 
      }, { quoted: msg });
    }

    let groupMetadata;
    try {
      groupMetadata = await socket.groupMetadata(groupJid);
    } catch {
      return await socket.sendMessage(sender, { 
        text: "❌ *Invalid group JID* or bot not in that group.*" 
      }, { quoted: msg });
    }

    const { participants, subject } = groupMetadata;
    let vcard = '';
    let index =1;

    await socket.sendMessage(sender, { 
      text: `🔍 Fetching contact names from *${subject}*...` 
    }, { quoted: msg });

    for (const participant of participants) {
      const num = participant.id.split('@')[0];
      let name = num;
      try {
        const contact = socket.contacts?.[participant.id] || {};
        if (contact?.notify) name = contact.notify;
        else if (contact?.vname) name = contact.vname;
        else if (contact?.name) name = contact.name;
        else if (participant?.name) name = participant.name;
      } catch {
        name = `Contact-${index}`;
      }

      vcard += `BEGIN:VCARD\n`;
      vcard += `VERSION:3.0\n`;
      vcard += `FN:${index}. ${name}\n`;
      vcard += `TEL;type=CELL;type=VOICE;waid=${num}:+${num}\n`;
      vcard += `END:VCARD\n`;
      index++;
    }

    const safeSubject = subject.replace(/[^\w\s]/gi, "_");
    const tmpDir = path.join(os.tmpdir(), `contacts_${Date.now()}`);
    fs.ensureDirSync(tmpDir);

    const filePath = path.join(tmpDir, `contacts-${safeSubject}.vcf`);
    fs.writeFileSync(filePath, vcard.trim());

    await socket.sendMessage(sender, { 
      text: `📁 *${participants.length}* contacts found in group *${subject}*.\n💾 Preparing VCF file...`
    }, { quoted: msg });

    await delay(1500);

    await socket.sendMessage(sender, {
      document: fs.readFileSync(filePath),
      mimetype: 'text/vcard',
      fileName: `contacts-${safeSubject}.vcf`,
      caption: `✅ *Contacts Exported Successfully!*\n👥 Group: *${subject}*\n📇 Total Contacts: *${participants.length}*\n\n> ᴘᴏ�ɪᴡ Ꮲ ᙻ 𝐕 𝐌ᴍ ᙰ 𝐕 𝐌ᴍ`,
      footer: `🤖 ${BOT_NAME_FANCY} 𝐂ᴏ𝚂𝐓𝙻𝙾𝙲`
    }, { quoted: msg });

    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file:', cleanupError);
    }

  } catch (err) {
    console.error('Save contact error:', err);
    await socket.sendMessage(sender, { 
      text: `❌ Error: ${err.message || err}` 
    }, { quoted: msg });
  }
  break;
}

case 'font': {
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const text = q.trim().replace(/^.fancy\s+/i, "");

    if (!text) {
        return await socket.sendMessage(sender, {
            text: `❎ *Please provide text to convert into fancy fonts.*\n\n📌 *Example:* \`.font yasas\``
        }, { quoted: msg });
    }

    try {
        // REPLACED API: aemt.me for Fancy Font
        const apiUrl = `https://aemt.me/other/font?text=${encodeURIComponent(text)}`;
        const response = await axios.get(apiUrl);

        if (!response.data.status || !response.data.result) {
            return await socket.sendMessage(sender, {
                text: "❌ *Error fetching fonts from API. Please try again later.*"
            }, { quoted: msg });
        }

        const fontList = response.data.result
            .map(font => `*${font.name}:*\n${font.result}`)
            .join("\n\n");

        const finalMessage = `🎨 *Fancy Fonts Converter*\n\n${fontList}\n\n_© ${config.BOT_NAME_FANCY}_`;

        await socket.sendMessage(sender, {
            text: finalMessage
        }, { quoted: msg });

    } catch (err) {
        console.error("Fancy Font Error:", err);
        await socket.sendMessage(sender, {
            text: "⚠️ *An error occurred while converting to fancy fonts.*"
        }, { quoted: msg });
    }

    break;
}

case 'gdrive': {
    try {
        const text = args.join(' ').trim();
        if (!text) return await socket.sendMessage(sender, { text: '⚠️ Please provide a Google Drive link.\n\nExample: `.gdrive <link>`', quoted: msg });

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        const shonux = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GDRIVE" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0015\nEND:VCARD` } }
        };

        // REPLACED API: aemt.me for GDrive Download
        const res = await axios.get(`https://aemt.me/download/gdrive?url=${encodeURIComponent(text)}`);
        if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch file info.' }, { quoted: shonux });

        const file = res.data.result;

        await socket.sendMessage(sender, {
            document: { 
                url: file.url, 
                mimetype: file.mimeType || 'application/octet-stream', 
                fileName: file.name 
            },
            caption: `📂 *File Name:* ${file.name}\n💾 *Size:* ${file.size}\n\n*Powered By ${botName}*`,
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: shonux });

    } catch (err) {
        console.error('GDrive command error:', err);
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;
        const shonux = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GDRIVE2" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0016\nEND:VCARD` } }
        };
        await socket.sendMessage(sender, { text: '❌ Error fetching Google Drive file.' }, { quoted: shonux });
    }
    break;
}

case 'adanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0017\nEND:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/ada');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Ada News.' }, { quoted: shonux });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n*📅 Date:* ${n.date}\n*⏰ Time:* ${n.time}\n\n${n.desc}\n\n*🔗 [Read more]* (${n.url})\n\n*Powered By ${botName}*`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: shonux });

  } catch (err) {
    console.error('adanews error:', err);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADA2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0018\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Error fetching Ada News.' }, { quoted: shonux });
  }
  break;
}
case 'sirasanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_SIRASA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0019\nEND:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/sirasa');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Sirasa News.' }, { quoted: shonux });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n*📅 Date:* ${n.date}\n*⏰ Time:* ${n.time}\n\n${n.desc}\n\n*🔗 [Read more]* (${n.url})\n\n*Powered By ${botName}*`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: shonux });

  } catch (err) {
    console.error('sirasanews error:', err);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_SIRASA2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0020\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Error fetching Sirasa News.' }, { quoted: shonux });
  }
  break;
}
case 'lankadeepanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_LANKADEEPA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0021\nEND:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/lankadeepa');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Lankadeepa News.' }, { quoted: shonux });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n*📅 Date:* ${n.date}\n*⏰ Time:* ${n.time}\n\n${n.desc}\n\n*🔗 [Read more]* (${n.url})\n\n*Powered By ${botName}*`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: shonux });

  } catch (err) {
    console.error('lankadeepanews error:', err);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_LANKADEEPA2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0022\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Error fetching Lankadeepa News.' }, { quoted: shonux });
  }
  break;
}
case 'gagananews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GAGANA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0023\nEND:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/gagana');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Gagana News.' }, { quoted: shonux });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n*📅 Date:* ${n.date}\n*⏰ Time:* ${n.time}\n\n${n.desc}\n\n*🔗 [Read more]* (${n.url})\n\n*Powered By ${botName}*`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: shonux });

  } catch (err) {
    console.error('gagananews error:', err);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GAGANA2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0024\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Error fetching Gagana News.' }, { quoted: shonux });
  }
  break;
}


// 💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐💐

        case 'unfollow': {
  const jid = args[0] ? args[0].trim() : null;
  if (!jid) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }
    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0025\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide channel JID to unfollow. Example:\n.unfollow 120363396379901844@newsletter' }, { quoted: shonux });
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = admins.map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0026\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or admins can remove channels.' }, { quoted: shonux });
  }

  if (!jid.endsWith('@newsletter')) {
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0027\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Invalid JID. Must end with @newsletter' }, { quoted: shonux });
  }

  try {
    if (typeof socket.newsletterUnfollow === 'function') {
      await socket.newsletterUnfollow(jid);
    }
    await removeNewsletterFromMongo(jid);

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0028\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ Unfollowed and removed from DB: ${jid}` }, { quoted: shonux });
  } catch (e) {
    console.error('unfollow error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW5" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0029\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to unfollow: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'owner': {
  try { await socket.sendMessage(sender, { react: { text: "🥷", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_OWNER"
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:WhatsApp Bot Developer
TITLE:Founder & CEO of Dtec  Mini Bot;
EMAIL;type=INTERNET:dula9x@gmail.com
ADR;type=WORK:;;Ratnapura;;Sri Lanka
URL:https://github.com
TEL;type=CELL;type=VOICE;waid=94752978237
TEL;type=CELL;type=VOICE;waid=94752978237
END:VCARD`
            }
        }
    };

    const text = `
👑 *ＤＴＺ ＮＯＶＡ Ｘ ＭＤ-XMD OWNER*

*👤 𝐍ame: ＤＴＺ ＮＯＶＡ 𝐧𝐕𝐣𝚃𝐢𝐧𝐱𝐧𝚃𝐢𝙳𝐭𝐥'
*📞 𝐍umber: +94768319673*

> 𝐏𝙾𝙾𝙴𝚙�𝚙�𝚂 𝐏𝚗 𝐏𝚀 𝐏𝚀 𝐏𝚁 𝐏𝚁 𝐏𝚁 𝐏𝚁 𝐏𝚁 𝐏𝚁 𝐏𝚁 𝐏𝚁 𝐏��𝐏𝚁 𝐏✘ 𝐌ᴅ*
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄" }, type: 1 },
      { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: "⚙️ 𝐒𝙀𝙴𝙻𝚃" }, type: 1 }
    ];

    await socket.sendMessage(sender, {
      text,
      footer: "👑 𝐎𝙾𝙾𝙾𝚙�𝚙�𝚂 𝐏🚁"
    }, { quoted: shonux });

  } catch (err) {
    console.error('owner command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show owner info.' }, { quoted: msg }); } catch(e){}
  }
  break;
}
case 'google':
case 'gsearch':
case 'search':
    try {
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, {
                text: '⚠️ *Please provide a search query.*\n\n*Example:*\n.google how to code in javascript'
            });
            break;
        }

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        const shonux = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GOOGLE" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0030\nEND:VCARD` } }
        };

        const query = args.join(" ");

        // REPLACED API: api.maher-zubair.tech for Google Search
        const apiUrl = `https://api.maher-zubair.tech/google-search?q=${encodeURIComponent(query)}`;
        const response = await axios.get(apiUrl);

        if (!response.data?.status || !response.data?.result?.length) {
            return await socket.sendMessage(sender, { text: `⚠️ *No results found for:* ${query}` }, { quoted: shonux });
        }

        let results = `🔍 *Google Search Results for:* "${query}"\n\n`;
        response.data.result.slice(0, 5).forEach((item, index) => {
            results += `*${index + 1}. ${item.title}*\n\n🔗 ${item.link}\n\n📝 ${item.snippet}\n\n`;
        });

        const firstResult = response.data.result[0];
        const thumbnailUrl = firstResult.thumbnail || 'https://via.placeholder.com/150';

        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: results.trim(),
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: shonux });

    } catch (error) {
        console.error(`Google search error:`, error);
        await socket.sendMessage(sender, { text: `⚠️ *An error occurred while fetching search results.*\n\n${error.message}` });
    }
    break;
}

case 'img': {
    const q = body.replace(/^[.\/!]img\s*/i, '').trim();
    if (!q) return await socket.sendMessage(sender, {
        text: '🔍 Please provide a search query. Ex: `.img sunset' // FIXED: Changed single quote to backtick for safety
    }, { quoted: msg });

    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        const shonux = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_IMG" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0031\nEND:VCARD` } }
        };

        // REPLACED API: api.maher-zubair.tech for Google Images
        const res = await axios.get(`https://api.maher-zubair.tech/google-image?q=${encodeURIComponent(q)}`);
        const data = res.data.data;
        if (!data || data.length === 0) return await socket.sendMessage(sender, { text: '❌ No images found for your query.' }, { quoted: shonux });

        const randomImage = data[Math.floor(Math.random() * data.length)];

        const buttons = [{ buttonId: `${config.PREFIX}img ${q}`, buttonText: { displayText: "🖼️ 𝐍𝙴𝚁 𝐍𝙴𝙴𝙴𝙶𝙴𝚄" }, type: 1 }];

        const buttonMessage = {
            image: { url: randomImage },
            caption: `🖼️ *Image Search:* ${q}\n\n*Provided By ${botName}*`,
            footer: config.FOOTER || '> *ＤＴＺ ＮＯＶＡ Ｘ ＭＤ*',
            buttons: buttons,
            headerType: 4,
            contextInfo: { mentionedJid: [sender] }
        };

        await socket.sendMessage(from, buttonMessage, { quoted: shonux });

    } catch (err) {
        console.error("Image search error:", err);
        await socket.sendMessage(sender, { text: '❌ Failed to fetch images.' }, { quoted: msg });
    }
    break;
}
case 'ig':
case 'insta':
case 'instagram': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const botMention = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_002"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0032
END:VCARD`
            }
        }
    };

    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const q = text.split(" ").slice(1).join(" ").trim();

    if (!q) {
      await socket.sendMessage(sender, {
        text: '*🚫 *Please provide an Instagram post/reel link.*',
        buttons: [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙻𝚄' }
        ]
      }, { quoted: botMention });
      return;
    }

    if (!q.includes("instagram.com")) {
      await socket.sendMessage(sender, {
        text: '*🚫 Invalid Instagram link.*',
        buttons: [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙻𝚄' }
        ]
      }, { quoted: botMention });
      return;
    }

    await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
    await socket.sendMessage(sender, { text: '*⏳ Downloading Instagram media...*' }, { quoted: botMention });

    // REPLACED API: aemt.me for Instagram Download
    const apiUrl = `https://aemt.me/download/ig?url=${encodeURIComponent(q)}`;
    const { data } = await axios.get(apiUrl).catch(() => ({ data: null }));
    if (!data?.status || !data?.downloadUrl) {
      return await socket.sendMessage(sender, { text: '🚩 Failed to fetch Instagram video.' }, { quoted: botMention });
    }

    const titleText = `*📸 ${botName} 𝐈𝙶𝚕𝚀𝙶𝚀𝙶𝚁 𝐃𝙾𝙴𝚂𝚂`;
    const content = `┏━━━━━━━━━━━━━━━━━━\n` +
                    `┃📌 \`𝐒ource\` : Instagram\n` +
                    `┃📹 \`𝚃ype\` : Video/Reel\n` +
                    `┃📝 \`𝐀uthor\` : @${data.author || 'Unknown'}\n` +
                    `┗━━━━━━━━━━━━━━━━━━`;

    const footer = `🤖 ${botName}`;

    const captionMessage = typeof formatMessage === 'function'
      ? formatMessage(titleText, content, footer)
      : `${titleText}\n\n${content}\n${footer}`;

    await socket.sendMessage(sender, {
        video: { url: data.downloadUrl },
        caption: captionMessage,
        contextInfo: { mentionedJid: [sender] },
        buttons: [
          { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
          { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '📡 BOT INFO' }, type: 1 }
        ],
        headerType: 1
    }, { quoted: botMention });

  } catch (err) {
    console.error("Error in Instagram downloader:", err);
    await socket.sendMessage(sender, { 
        text: '*❌ Internal Error. Please try again later.*',
        buttons: [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }
        ]
    });
  }
  break;
}

case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN1" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0033\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid or number to add as admin\nExample: .addadmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0034\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Only owner can add admins.' }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0035\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ Added admin: ${jidOr}` }, { quoted: shonux });

  } catch (e) {
    console.error('addadmin error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0036\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to add admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0037\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Provide a jid/number to remove\nExample: .deladmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0038\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Only owner can remove admins.' }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0039\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ Removed admin: ${jidOr}` }, { quoted: shonux });

  } catch (e) {
    console.error('deladmin error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0040\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to remove admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0041\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'No admins configured.' }, { quoted: shonux });
    }

    let txt = '*👑 Admins:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('admins error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0042\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to list admins.' }, { quoted: shonux });
  }
  break;
}
case 'setlogo': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO1" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0043\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change this session logo.' }, { quoted: shonux });
    break;
  }

  const ctxInfo = (msg.message.extendedTextMessage || {}).contextInfo || {};
  const quotedMsg = ctxInfo.quotedMessage;
  const media = await downloadQuotedMedia(quotedMsg).catch(()=>null);
  let logoSetTo = null;

  try {
    if (media && media.buffer) {
      const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
      fs.ensureDirSync(sessionPath);
      const mimeExt = (media.mime && media.mime.split('/').pop()) || 'jpg';
      const logoPath = path.join(sessionPath, `logo.${mimeExt}`);
      fs.writeFileSync(logoPath, media.buffer);
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = logoPath;
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = logoPath;
    } else if (args && args[0] && (args[0].startsWith('http') || args[0].startsWith('https'))) {
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = args[0];
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = args[0];
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO2" },
        message: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0044\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❗ Usage: Reply to an image with `.setlogo` OR provide an image URL: `.setlogo https://example.com/logo.jpg`' }, { quoted: shonux });
    }

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO3" },
      message: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0045\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Logo set for this session: ${logoSetTo}` }, { quoted: shonux });
  } catch (e) {
    console.error('setlogo error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO4" },
      message: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0046\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set logo: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'setbotname': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
      message: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0047\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change this session bot name.' }, { quoted: shonux });
  }

  const name = args.join(' ').trim();
  if (!name) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
      message: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0048\nEND:VCARD` } }
    };

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg.botName = name;
    await setUserConfigInMongo(sanitized, cfg);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0049\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ *Your Bot Display Name updated to: ${name}*` }, { quoted: shonux });
  } catch (e) {
    console.error('setbotname error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0050\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set bot name: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'settings': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS1" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0051\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can view settings.' }, { quoted: shonux });
    }

    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || config.BOT_NAME_FANCY;
    
    const settingsText = `
*╭─「 𝗖𝙾𝚄𝚄𝙴 𝐒𝚂𝙴𝙳𝙶 」 ──●●➤*  
*│ 🔧  𝐖ᴏʀᴏʀᴢ:* ${currentConfig.WORK_TYPE || 'public'}
*│ 🎭  𝐏ʀᴘꜱᴇɴ:* ${currentConfig.PRESENCE || 'available'}
*│ 👁️  𝐀ᴜᴛɪ Ᏹᴇɴᴇ Ᏹᴇɴ:* ${currentConfig.AUTO_VIEW_STATUS || 'true'}
*│ ❤️  𝐀ᴜᴛᴏᴇᴄ:* ${currentConfig.AUTO_LIKE_STATUS || 'true'}
*│ 📞  𝐀ᴜᴛᴇᴇᴄ:* ${currentConfig.ANTI_CALL || 'off'}
*│ 📖  𝐀ᴜᴇ Ᏹᴇ:* ${currentConfig.AUTO_READ_MESSAGE || 'off'}
*│ 🎥  𝐀ᴜᴏᴇᴇ:* ${currentConfig.AUTO_RECORDING || 'false'}
*│ ⌨️  𝐀ᴜᴛᴏᴇᴄ:* ${currentConfig.AUTO_TYPING || 'false'}
*│ 🔣  𝐏ᚁ𝚂𝙁 𝐏:* ${currentConfig.PREFIX || '.'}
*│ 🎭  𝐒𝚃𝚄𝚄𝚄 𝐎𝙴𝙳𝙶:* ${(currentConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ')}
*╰──────────────●●➤`;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS2" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0052\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
      image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
      caption: settingsText,
      footer: "> *ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ*'
    }, { quoted: shonux });
    
  } catch (e) {
    console.error('Settings command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS3" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0053\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '*❌ Error loading settings!*' }, { quoted: shonux });
  }
  break;
}

case 'checkjid': {
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CID" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0054\nEND:VCARD` } }
    };

    const channelLink = q.replace(/^[.\/!]cid\s*/i, '').trim();

    if (!channelLink) {
        return await socket.sendMessage(sender, {
            text: '❎ Please provide a WhatsApp Channel link.\n📌 *Example:* .cid https://whatsapp.com/channel/123456789'
        }, { quoted: shonux });
    }

    const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)$/);
    if (!match) {
        return await socket.sendMessage(sender, {
            text: '⚠️ *Invalid channel link format.*\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/xxxxxxxxx'
        }, { quoted: shonux });
    }

    const inviteId = match[1];

    try {
        await socket.sendMessage(sender, {
            text: `🔎 Fetching channel info for: *${inviteId}*`
        }, { quoted: shonux });

        const metadata = await socket.newsletterMetadata("invite", inviteId);

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, {
                text: '❌ Channel not found or inaccessible.'
            }, { quoted: shonux });
        }

        const infoText = `
📡 *WhatsApp Channel Info*

🆔 *ID:* ${metadata.id}
📌 *Name:* ${metadata.name}
👥 *Followers:* ${metadata.subscribers?.toLocaleString() || 'N/A'}
📅 *Created On:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("si-LK") : 'Unknown'}

*🤖 Powered by ${botName}*`;
`;

        await socket.sendMessage(sender, {
            text: infoText
        }, { quoted: shonux });

    } catch (err) {
        console.error("CID command error:", err);
        await socket.sendMessage(sender, { text: '⚠️ An unexpected error occurred while fetching channel info.' }, { quoted: shonux });
    }
    break;
}

case 'owner': {
  try {
    let vcard = 
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      'FN:YASAS\n' + 
      'ORG:WhatsApp Bot Developer;\n' + 
      'TITLE:Founder & CEO of Dtec  Mini Bot;\n' + 
      'EMAIL;type=INTERNET:dula9x@gmail.com\n' + 
      'ADR;type=WORK:;;Ratnapura;;Sri Lanka\n' + 
      'URL:https://github.com\n' +
      'TEL;type=CELL;type=VOICE;waid=94752978237\n' +
      'TEL;type=CELL;type=VOICE;waid=94752978237\n' + 
      'END:VCARD';

    await socket.sendMessage(
      m.chat,
      {
        contacts: {
          displayName: '𝓓𝓣𝓩';
          contacts: [{ vcard }]
        }
      },
      { quoted: m.chat }
    );

  } catch (err) {
    console.error(err);
    await socket.sendMessage(m.chat, { text: '⚠️ Owner info fetch error.' }, { quoted: m.chat });
  }
}
break;
}
case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADDADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid or number to add as admin\nExample: .addadmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADDADMIN2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can add admins.' }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADDADMIN3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ Added admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('addadmin error', e);
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADDADMIN4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to add admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid/number to remove\nExample: .deladmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Only owner can remove admins.' }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid=9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ Removed admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('deladmin error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE: & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid=9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type:VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to remove admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADMINS1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid=9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'No admins configured.' }, { quoted: shonux });
    }

    let txt = '*👑 Admins:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('admins error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;\nTITLE: Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type:VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid=9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nTEL;type=CELL;type=VOICE;waid:9477xxxxxxx\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to list admins.' }, { quoted: shonux });
  }
  break;
}

case 'setlogo': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO1" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0055\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change this session logo.' }, { quoted: shonux });
    break;
  }

  const ctxInfo = (msg.message.extendedTextMessage || {}).contextInfo || {};
  const quotedMsg = ctxInfo.quotedMessage;
  const media = await downloadQuotedMedia(quotedMsg).catch(()=>null);
  let logoSetTo = null;

  try {
    if (media && media.buffer) {
      const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
      fs.ensureDirSync(sessionPath);
      const mimeExt = (media.mime && media.mime.split('/').pop()) || 'jpg';
      const logoPath = path.join(sessionPath, `logo.${mimeExt}`);
      fs.writeFileSync(logoPath, media.buffer);
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = logoPath;
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = logoPath;
    } else if (args && args[0] && (args[0].startsWith('http') || args[0].startsWith('https'))) {
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = args[0];
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = args[0];
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0056\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❗ Usage: Reply to an image with `.setlogo` OR provide an image URL: `.setlogo https://example.com/logo.jpg`', quoted: shonux });
    }

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO3" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0057\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Logo set for this session: ${logoSetTo}` }, { quoted: shonux });
  } catch (e) {
    console.error('setlogo error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0058\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set logo: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'jid': {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const userNumber = sender.split('@')[0];

    await socket.sendMessage(sender, { 
        react: { text: "🆔", key: msg.key } 
    });

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID_JID" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nEND:VCARD` }`
    };

    await socket.sendMessage(sender, {
        text: `*🆔 Chat JID:* ${sender}\n*📞 Your Number:* +${userNumber}`,
    }, { quoted: shonux });
    break;
}

case 'block': {
  try {
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');
    const admin = await loadAdminsFromMongo();
    const isAdmin = admin.includes(nowsender) || admin.includes(senderNumber) || admin.includes(senderNumber);

    if (!isbot && !isOwner) {
      return await socket.sendMessage(sender, { 
        text: '❌ Permission denied.'
      });
      return;
    }

    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant;
    else if (ctx?.mentionedJid && ctx.mentionedJid.length > 0) targetJid = ctx.mentionedJid[0];
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
        return await socket.sendMessage(sender, { 
            text: '❗ Provide number to block. Example: .block 9477xxxxxxx' 
        });
    }

    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'block');
      } else {
        await socket.updateBlockStatus(targetJid, 'block');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}

      await socket.sendMessage(sender, { text: `✅ @${targetJid.split('@')[0]} blocked successfully.`, mentions: [targetJid] });
    } catch (err) {
      console.error('Block error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to block user.' });
    }
  } catch (err) {
    console.error('block command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing block command.' });
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing block command.' });
  }
}

case 'unblock': {
  try {
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    const admin = await loadAdminsFromMongo();
    const isAdmin = admin.includes(nowsender) || admin.includes(senderNumber) || admin.includes(senderNumber);

    if (!isbot && !isOwner) {
        return await socket.sendMessage(sender, { 
            text: '❌ Permission denied.' 
        });
        return;
    }

    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant;
    else if (ctx?.mentionedJid && ctx.mentionedJid.length > 0) targetJid = ctx.mentionedJid[0];
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      await socket.sendMessage(sender, { text: '❗ Provide number to unblock\nExample: .unblock 9477xxxxxxx' });
    }

    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'unblock');
      } else {
        await socket.updateBlockStatus(targetJid, 'unblock');
      }
      try { await socket.sendMessage(sender, { react: { text: "🔓", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `🔓 @${targetJid.split('@')[0]} unblocked successfully.`, mentions: [targetJid] });
    } catch (err) {
      console.error('Unblock error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to unblock user.' });
    }
  } catch (err) {
    console.error('unblock command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing unblock command.' });
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing unblock command.' });
  }
}
case 'setbotname': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 5550034\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change this session bot name.' }, { quoted: shonux });
  }

  const name = args.join(' ').trim();
  if (!name) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0035\nEND:VCARD` } }
    };

    try {
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.botName = name;
      await setUserConfigInMongo(sanitized, cfg);

      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0036\nEND:VCARD` } }
      };

      await socket.sendMessage(sender, { text: `✅ Bot display name set for this session: ${name}` }, { quoted: shonux });
    } catch (e) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0037\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `❌ Failed to set bot name: ${e.message || e}` }, { quoted: shonux });
    }
}

case 'settings': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0038\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can view settings.' }, { quoted: shonux });
    }

    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || BOT_NAME_FANCY;
    
    const settingsText = `
*╭─「 𝗖𝙾𝙾𝚄𝚄𝚄𝙴𝚄𝙴𝚄𝙴 」 ──●●➤*  
*│ 🔧 𝐖ᴏʀᴏᴗ:* ${currentConfig.WORK_TYPE || 'public'}
*│ 🎭  𝐏ʀᴘꜱᴇɴ:* ${currentConfig.PRESENCE || 'available'}
*│ 👁️ 𝐀ᴜᴛɪ Ᏹᴇᴄ:* ${currentConfig.AUTO_VIEW_STATUS || 'true'}
*│ ❤️ 𝐀ᴜᴛᴏᴇᴄ:* ${currentConfig.AUTO_LIKE_STATUS || 'true'}
*│ 📞  𝐀ᴜᴛᴏᴇᴄ:* ${currentConfig.ANTI_CALL || 'off'}
*│ 📖  𝐀ᴜᴛᴏᴇᴄ:* ${currentConfig.AUTO_READ_MESSAGE || 'off'}
*│ 🎥  𝐀ᴜᴛᴏᴇᴄ:* ${currentConfig.AUTO_RECORDING || 'false'}
*│ ⌨️  𝐀ᴜᴛᴏᴇᴄ:* ${currentConfig.AUTO_TYPING || 'false'}
*│ 🔣  𝐏ᚁ𝚂𝙰𝙲𝚁 𝐏ᚁ:* ${currentConfig.PREFIX || '.'}
*│ 🎭  𝐒𝚃𝚄𝚄𝚄 𝐎𝚃𝙴𝚄 𝐎: *🍁 *${(currentConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ') || config.AUTO_LIKE_EMOJI).join(' ')}`;
*╰──────────────◉◉◉➤`;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS2" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0039\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
      image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
      caption: settingsText
    }, { quoted: shonux });
    
  } catch (e) {
    console.error('Settings command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS3" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0040\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Error loading settings!*', });
  }
  break;
}

case 'checkjid': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const userNumber = sender.split('@')[0];

    await socket.sendMessage(sender, { 
        react: { text: "🆔", key: msg.key } 
    });

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0041\nEND:VCARD` } }
    };

    const target = args[0] || sender;
    let targetJid = target;

    if (!target.includes('@')) targetJid = target.endsWith('@g.us') ? target : `${target}@g.us`;
    else if (target.length > 15) targetJid = target.endsWith('@newsletter') ? target : `${target}@newsletter`;
    else targetJid = target.endsWith('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;

    let type = 'Unknown';
    if (targetJid.endsWith('@g.us')) {
      type = 'Group';
    } else if (targetJid.endsWith('@newsletter')) {
      type = 'Newsletter';
    } else if (targetJid.endsWith('@s.whatsapp.net')) {
      type = 'User';
    } else if (targetJid.endsWith('@broadcast')) {
      type = 'Broadcast List';
    } else {
      type = 'Unknown';
    }

    const responseText = `🔍 *JID INFORMATION*\n\n☘️ *Type:* ${type}\n🆔 *JID:* ${targetJid}\n\n╰──────────────────────────────`;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0042\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: responseText
    }, { quoted: shonux });

  } catch (error) {
    console.error('Checkjid command error:', error);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID3" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0043\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Error checking JID information.' }, { quoted: shonux });
  }
  break;
}

case 'owner': {
  try { await socket.sendMessage(sender, { react: { text: "🥷", key: msg.key } }); } catch(e){}

  try {
    let vcard = 
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      'FN:YASAS\n' + 
      'ORG:WhatsApp Bot Developer;\nTITLE:Founder & CEO of Dtec  Mini Bot;\n' +
      'EMAIL;type=INTERNET:dula9x@gmail.com\n' +
      'ADR;type=WORK:;;Ratnapura;;Sri Lanka\n' +
      'URL:https://github.com\n' +
      'TEL;type=CELL;type=VOICE;waid=94752978237\n' +
      'TEL;type=CELL;type=VOICE;waid=94752978237\n' + 
      'END:VCARD';

    await socket.sendMessage(
      m.chat,
      {
        contacts: { displayName: '𝓓𝓣𝓩',
          contacts: [{ vcard }]
        }
      },
      { quoted: m.chat }
    );
  } catch (err) {
    console.error(err);
    await socket.sendMessage(m.chat, { text: '❌ Owner info fetch error.' });
  }
}
break;
case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADDADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer\nTITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid=94752978237\nTEL;type=CELL;type=VOICE;waid=94772978237\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid or number to add as admin\nExample: .addadmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADDADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;TITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0018\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Only owner can add admins.' }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADDADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;TITLE:Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid=94752978237\nTEL;type=CELL;type=VOICE;waid=94752978237\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ Added admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('addadmin error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADDADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;TITLE: Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOIC;waid:94752978237\nTEL;type=CELL;type:VOIC;waid:94752978237\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to add admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;TITLE: Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:94772978237\nTEL;type=CELL;type=VOICE;waid=94772978237\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Provide jid/number to remove\nExample: .deladmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;TITLE: Founder & CEO of Dtec  Mini Bot;\nEMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:94772978237\nTEL;type=CELL;type=VOICE;waid=94772978237\nTEL;type=CELL;type=VOICE;waid:94772978237\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Only owner can remove admins.' }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;TITLE: Founder & CEO of Dtec  Mini Bot;EMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:94772978237\nTEL;type=CELL;type=VOICE;waid:94772978237\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ Removed admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('deladmin error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:WhatsApp Bot Developer;TITLE: Founder & CEO of Dtec  Mini Bot;EMAIL;type=INTERNET:dula9x@gmail.com\nADR;type=WORK:;;Ratnapura;;Sri Lanka\nURL:https://github.com\nTEL;type=CELL;type=VOICE;waid:94772978237\nTEL;type=CELL;type=VOICE;waid:94772978237\nTEL;type=CELL;type=VOICE;waid:94772978237\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to remove admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '© ＤＴＺ ＮＯＶＡ Ｘ ＭＤ Ｘ ＭＤ ✘ 𝐌ᴅ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADMINS1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}||||\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:94772978237\nTEL;type=CELL;type=VOICE;waid:94772978237\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'No admins configured.', { quoted: shonux });
    }

    let txt = '*👑 Admins:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('admins error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title};;;;\nFN:${title};;;;;;;;\nFN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:94772978237\nTEL;type=CELL;type=VOICE;waid:94772978237\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to list admins.' }, { quoted: shonux });
  }
  break;
}
case 'setlogo': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO1" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0044\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only session owner or bot owner can change this session logo.', { quoted: shonux });
    break;
  }

  const ctxInfo = (msg.message.extendedTextMessage || {}).contextInfo || {};
  const quotedMsg = ctxInfo.quotedMessage;
  const media = await downloadQuotedMedia(quotedMsg).catch(()=>null);
  let logoSetTo = null;

  try {
    if (media && media.buffer) {
      const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
      fs.ensureDirSync(sessionPath);
      const mimeExt = (media.mime && media.mime.split('/').pop()) || 'jpg';
      const logoPath = path.join(sessionPath, `logo.${mimeExt}`);
      fs.writeFileSync(logoPath, media.buffer);
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = logoPath;
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = logoPath;
    } else if (args && args[0] && (args[0].startsWith('http') || args[0].startsWith('https'))) {
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = args[0];
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = args[0];
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO2" },
        message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0045\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: '❗ Usage: Reply to an image with `.setlogo` OR provide an image URL: `.setlogo https://example.com/logo.jpg` ', { quoted: shonux });
    }

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO3" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0046\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ Logo set for this session: ${logoSetTo}` }, { quoted: shonux });
  } catch (e) {
    console.error('setlogo error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO4" },
      message: { contactMessage: { displayName: config.BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid:13135550002:+1 313 555 0047\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set logo: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

// default:
  break;
    }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }

  });
}

// ---------------- Call Rejection Handler ----------------

async function setupCallRejection(socket, sessionNumber) {
  if (!socket) return;

  socket.ev.on('call', async (calls) => {
      try {
          const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
          const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
          if (userConfig.ANTI_CALL !== 'on') return;

          for (const call of calls) {
              if (call.status !== 'offer') continue;

                  const id = call.id;
                  const from = call.from;

                  await socket.rejectCall(id, from);
                  
                  await socket.sendMessage(from, {
                      text: '*🔕 Auto call rejection is enabled. Calls are automatically rejected.*'
                  });
              } else {
                  await socket.sendMessage(from, { text: '❌ Auto call rejection is enabled. Calls are automatically rejected.' });
              }
          }
      } catch (err) {
          console.error(`Call rejection error for ${sessionNumber}:`, err);
      }
  });
}

// ---------------- Auto Message Read Handler ----------------

async function setupAutoMessageRead(socket, sessionNumber) {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;
    
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (getContentType(msg.message) === 'ephemeralMessage') 
        ? msg.message.ephemeralMessage.message 
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage' && msg.message.imageMessage) {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage' && msg.message.videoMessage) {
        body = msg.message.videoMessage?.caption || '';
      } else {
        body = '';
      }
    } catch(e) { body = ''; }
    } catch (e) { body = ''; }

    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body && body.startsWith && body.startsWith(prefix);

    if (autoReadSetting === 'all') {
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Message read: ${msg.key.id}`);
      } catch (error) { console.warn('Failed to read message:', error?.message || err); }
    } else if (autoReadSetting === 'cmd' && isCmd) {
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Command message read: ${msg.key.id}`);
      } catch (error) { console.warn('Failed to read command message:', error?.message || err); }
    }

    try { await initMongo().catch((){ console.warn('initMongo startup failed at startup', err); return; }catch(e){}
}

(async()=>{
try {
    try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { await EmpirePair(n, { headersSent:false, send:()=>{}, status:()=>mockRes }); await delay(500); } } catch(e){ console.error('Connect all failed', e); await delay(2000); activeSockets.delete(n); socketCreationTime.delete(n); }
})();
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) {
    console.error('deleteSessionAndCleanup error:', err);
    await deleteSessionAndCleanup(number, socket);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); await deleteSessionAndCleanup(number, socket); }
});

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws?.close(); } catch(e) {}
    activeSockets.delete(number); socketCreationTime.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){ console.error(err); }
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try {
    const pm2name = process.env.PM2_NAME || 'CHATUWA-MINI-main';
    try { exec(`pm2.restart ${pm2name} }); } catch(e) { console.error('Failed to restart pm2:', e); }
});

module.exports = router;
