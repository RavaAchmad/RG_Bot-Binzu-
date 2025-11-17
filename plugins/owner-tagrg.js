import { readConfig } from '../json/configManager.js';
import { EventEmitter } from 'events';

let commandCache = null;
let commandCacheTime = 0;
const COMMAND_CACHE_DURATION = 1000;

let handler = async (m, { conn, text, command }) => {
  EventEmitter.defaultMaxListeners = 20;
  
  try {
    // Load config dari brainiesDB.json
    const now = Date.now();
    let brainiesDB;
    if (commandCache && (now - commandCacheTime) < COMMAND_CACHE_DURATION) {
      brainiesDB = commandCache;
    } else {
      brainiesDB = await readConfig();
      commandCache = brainiesDB;
      commandCacheTime = now;
    }
    
    if (!brainiesDB || Object.keys(brainiesDB).length === 0) {
      return m.reply('⚠️ Gagal load database brainies. File kosong atau error.');
    }

    // Extract groupId dari config
    const groupId = Array.isArray(brainiesDB.groupId) 
      ? brainiesDB.groupId[0] 
      : brainiesDB.groupId || '120363422919131515@g.us';

    // Map command ke room (rg1 -> R1, rg2 -> R2, dst)
    const roomMap = {
      'rg1': 'R1',
      'rg2': 'R2',
      'rg3': 'R3',
      'rg4': 'R4',
      'rg5': 'R5'
    };

    const displayName = roomMap[command.toLowerCase()];
    
    if (!displayName || !brainiesDB[displayName]) {
      return m.reply(`Waduh, command *${command}* belum ada di database nih.`);
    }

    // Get targets dari room yang dipilih
    const roomData = brainiesDB[displayName];
    const targets = [];

    // Extract semua nomor dari room (support string & array)
    for (let [name, numbers] of Object.entries(roomData)) {
      if (Array.isArray(numbers)) {
        targets.push(...numbers.map(num => ({ name, number: num })));
      } else if (typeof numbers === 'string') {
        targets.push({ name, number: numbers });
      }
    }

    if (targets.length === 0) {
      return m.reply(`⚠️ Room ${displayName} kosong. Belum ada member yang terdaftar.`);
    }

    console.log(`${displayName} targets:`, targets);

    // Caching metadata buat hindarin rate limit
    if (!conn.groupCache) conn.groupCache = {};
    if (!conn.groupCache[groupId]) {
      conn.groupCache[groupId] = await conn.groupMetadata(groupId);
      setTimeout(() => delete conn.groupCache[groupId], 5 * 60 * 1000);
    }

    const groupMetadata = conn.groupCache[groupId];
    const participants = groupMetadata.participants;

    // TRACKING SYSTEM
    const validMentions = [];
    const successMembers = [];
    const notInGroupMembers = [];

    // PENTING: Buat map dari semua participants buat matching lebih cepat
    const participantMap = new Map();
    participants.forEach(p => {
      if (p.id) {
        // Extract nomor dari ID (bisa JID atau LID)
        const phoneMatch = p.id.match(/(\d+)/);
        if (phoneMatch) {
          participantMap.set(phoneMatch[1], p.id);
        }
      }
    });

    console.log(`Total participants di grup: ${participantMap.size}`);

    for (let target of targets) {
      const { name, number } = target;
      
      // Normalize number (hapus semua non-digit)
      const cleanNumber = number.replace(/\D/g, '');
      
      // CARA 1: Cek di participantMap (paling akurat)
      if (participantMap.has(cleanNumber)) {
        const participantId = participantMap.get(cleanNumber);
        validMentions.push(participantId);
        successMembers.push({ name, number, lid: participantId });
        console.log(`✅ Found ${name}: ${participantId}`);
        continue;
      }
      
      // CARA 2: Coba format JID standar
      const standardJid = `${cleanNumber}@s.whatsapp.net`;
      if (participants.some(p => p.id === standardJid)) {
        validMentions.push(standardJid);
        successMembers.push({ name, number, lid: standardJid });
        console.log(`✅ Found ${name} (JID): ${standardJid}`);
        continue;
      }
      
      // CARA 3: Coba format LID (untuk grup besar)
      const lidFormat = `${cleanNumber}@lid`;
      if (participants.some(p => p.id === lidFormat)) {
        validMentions.push(lidFormat);
        successMembers.push({ name, number, lid: lidFormat });
        console.log(`✅ Found ${name} (LID): ${lidFormat}`);
        continue;
      }
      
      // JIKA SEMUA GAGAL: Nomor tidak ada di grup
      notInGroupMembers.push({ name, number });
      console.warn(`❌ Member tidak ditemukan: ${name} (${number})`);
    }

    console.log(`Valid mentions for ${displayName}:`, validMentions.length);
    console.log(`Success members:`, successMembers.length);
    console.log(`Not in group:`, notInGroupMembers.length);

    if (validMentions.length === 0) {
      return m.reply(`❌ Tidak ada member yang valid untuk di-tag di room ${displayName}!\n\nKemungkinan:\n• Format nomor di database salah\n• Semua member belum join grup\n• GroupID salah`);
    }

    // SUSUN PESAN UTAMA
    let messageText = `_Hallo Brainies, pejuang PTN 2026_\n\n`;
    messageText += `KHUSUS untuk jadwal pembelajaran SNBT akan share di grup ini ya, jadi kalau ada temennya yang belum masuk grup ini harap colek colek yaa temen-temen 😊\n\n`;
    messageText += `Jadwal hari ini\n`;
    messageText += `Sesi 1  (17.00 - 20.30)\n- SNBT ${roomMap}\n\n`;
    messageText += `Sesi 2  (19.00 - 20.30)\n- SNBT ${roomMap}\n\n`;
    messageText += `Info kelasnya sudah Kak Indri share kemarin di atas bisa di-scroll aja ya, atau bisa cek di aplikasi. Jika jadwal belum berubah, masih tahap penyesuaian jadwal kelas terbaru ya. Terima kasih 😊\n\n`;

    // KIRIM PESAN dengan mentions yang VALID
    // await conn.sendMessage(groupId, {
    //   text: messageText,
    //   mentions: validMentions // Hanya nomor yang benar-benar ada di grup
    // });
    await conn.sendMessage(groupId, {
      text: messageText,
      contextInfo: {
        mentionedJid: validMentions,
        groupMentions: [
          { groupSubject: `${roomMap}`, groupJid: groupId }
        ]
      }
    });    

    // BIKIN REPORT DETAIL
    let reportText = `✅ *Tag ${displayName} Selesai!*\n\n`;
    reportText += `📊 *Summary:*\n`;
    reportText += `• Total database: ${targets.length} member\n`;
    reportText += `• Berhasil di-tag: ${successMembers.length} member\n`;
    reportText += `• Tidak ditemukan: ${notInGroupMembers.length} member\n\n`;

    // Detail member yang berhasil
    if (successMembers.length > 0) {
      reportText += `✅ *Berhasil di-tag:*\n`;
      successMembers.forEach((mem, idx) => {
        reportText += `${idx + 1}. ${mem.name} (${mem.number})\n`;
      });
      reportText += `\n`;
    }

    // Detail member yang error
    if (notInGroupMembers.length > 0) {
      reportText += `⚠️ *Nomor Tidak Ditemukan di Grup:*\n`;
      reportText += `_Kemungkinan penyebab:_\n`;
      reportText += `_• Nomor belum join grup ini_\n`;
      reportText += `_• Format nomor salah di database_\n`;
      reportText += `_• Nomor sudah keluar dari grup_\n\n`;
      
      notInGroupMembers.forEach((mem, idx) => {
        reportText += `${idx + 1}. ${mem.name} → *${mem.number}* ❌\n`;
      });
      reportText += `\n_Cek nomor ini di database & pastikan mereka sudah join grup!_`;
    }

    // Kirim report
    m.reply(reportText);

  } catch (e) {
    console.error('Error di ruangguru command:', e);
    m.reply(`⚠️ Gagal bosku: ${e.message || 'Unknown error'}\n\nStack trace:\n${e.stack?.substring(0, 500) || 'N/A'}`);
  }
};

handler.command = /^(rg[1-5])$/i;

export default handler;