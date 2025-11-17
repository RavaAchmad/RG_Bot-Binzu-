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

    // TRACKING SYSTEM - Ini yang baru!
    const validMentions = [];
    const successMembers = []; // Member yang berhasil di-tag
    const errorMembers = [];   // Member yang gagal/error
    const notInGroupMembers = []; // Member yang nomornya ga ada di grup

    for (let target of targets) {
      const { name, number } = target;
      
      // Normalize number (hapus semua non-digit)
      const cleanNumber = number.replace(/\D/g, '');
      
      // Cari participant yang match
      const participant = participants.find(p => {
        const pPhone = p.phoneNumber?.replace(/\D/g, '');
        return pPhone === cleanNumber;
      });
      
      if (participant && participant.id) {
        // SUKSES: Pakai LID dari participant
        validMentions.push(participant.id);
        successMembers.push({ name, number, lid: participant.id });
      } else {
        // Fallback: coba convert JID ke LID
        const jid = `${cleanNumber}@s.whatsapp.net`;
        const lid = conn.getLid(jid);
        
        // Check apakah LID ada di participants
        if (participants.some(p => p.id === lid)) {
          validMentions.push(lid);
          successMembers.push({ name, number, lid });
        } else {
          // ERROR: Nomor ga ketemu di grup
          // Tetep masukin ke mentions biar keliatan "tidak dikenal"
          validMentions.push(lid); // Tetep di-mention tapi bakal "tidak dikenal"
          notInGroupMembers.push({ name, number });
          
          // Log buat debugging
          console.warn(`⚠️ Member tidak ditemukan di grup: ${name} (${number})`);
        }
      }
    }

    console.log(`Valid mentions for ${displayName}:`, validMentions);
    console.log(`Success members:`, successMembers.length);
    console.log(`Not in group:`, notInGroupMembers.length);

    // SUSUN PESAN UTAMA
    let messageText = `_Hallo Brainies, pejuang PTN 2026_\n\n`;
    messageText += `KHUSUS untuk jadwal pembelajaran SNBT akan share di grup ini ya, jadi kalau ada temennya yang belum masuk grup ini harap colek colek yaa temen-temen 😊\n\n`;
    messageText += `Jadwal hari ini\n`;
    messageText += `Sesi 1  (17.00 - 20.30)\n- SNBT ${groupId}\n\n`;
    messageText += `Sesi 2  (19.00 - 20.30)\n- SNBT ${groupId}\n\n`;
    messageText += `Info kelasnya sudah Kak Indri share kemarin di atas bisa di-scroll aja ya, atau bisa cek di aplikasi. Jika jadwal belum berubah, masih tahap penyesuaian jadwal kelas terbaru ya. Terima kasih 😊\n\n`;

    // KIRIM PESAN dengan SEMUA mentions (valid + invalid)
    // await conn.sendMessage(groupId, {
    //   text: messageText,
    //   mentions: validMentions // Semua nomor termasuk yang error bakal di-tag
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
    reportText += `• Error/Tidak dikenal: ${notInGroupMembers.length} member\n\n`;

    // Detail member yang berhasil
    if (successMembers.length > 0) {
      reportText += `✅ *Berhasil di-tag:*\n`;
      successMembers.forEach((mem, idx) => {
        reportText += `${idx + 1}. ${mem.name} (${mem.number})\n`;
      });
      reportText += `\n`;
    }

    // Detail member yang error - INI YANG LU BUTUHIN!
    if (notInGroupMembers.length > 0) {
      reportText += `⚠️ *Nomor Bermasalah (Tidak Dikenal):*\n`;
      reportText += `_Nomor ini muncul sebagai "tidak dikenal" di grup. Kemungkinan:_\n`;
      reportText += `_• Nomor tidak aktif_\n`;
      reportText += `_• Belum join grup_\n`;
      reportText += `_• Salah input di database_\n\n`;
      
      notInGroupMembers.forEach((mem, idx) => {
        reportText += `${idx + 1}. ${mem.name} → *${mem.number}* ❌\n`;
      });
      reportText += `\n_Cek nomor ini di database lu bro!_`;
    }

    // Kirim report ke lu
    m.reply(reportText);

  } catch (e) {
    console.error('Error di ruangguru command:', e);
    m.reply(`⚠️ Gagal bosku: ${e.message || 'Unknown error'}\n\nCek log untuk detail.`);
  }
};

handler.command = /^(rg[1-5])$/i;

export default handler;