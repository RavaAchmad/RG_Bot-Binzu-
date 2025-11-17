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
    // const brainiesDB = await readConfig();
    
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
        targets.push(...numbers);
      } else if (typeof numbers === 'string') {
        targets.push(numbers);
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

    // Convert target numbers ke LID format
    const validMentions = [];
    const memberNames = []; // Untuk display siapa aja yang di-tag

    for (let number of targets) {
      // Normalize number (hapus semua non-digit)
      const cleanNumber = number.replace(/\D/g, '');
      
      // Cari participant yang match
      const participant = participants.find(p => {
        const pPhone = p.phoneNumber?.replace(/\D/g, '');
        return pPhone === cleanNumber;
      });
      
      if (participant && participant.id) {
        // Pakai LID dari participant
        validMentions.push(participant.id);
        
        // Cari nama member dari database
        const memberName = Object.entries(roomData).find(([name, nums]) => {
          const numArray = Array.isArray(nums) ? nums : [nums];
          return numArray.includes(number);
        })?.[0];
        
        if (memberName) memberNames.push(memberName);
      } else {
        // Fallback: coba convert JID ke LID
        const jid = `${cleanNumber}@s.whatsapp.net`;
        const lid = conn.getLid(jid);
        // Check apakah LID ada di participants
        if (participants.some(p => p.id === lid)) {
          validMentions.push(lid);
          
          const memberName = Object.entries(roomData).find(([name, nums]) => {
            const numArray = Array.isArray(nums) ? nums : [nums];
            return numArray.includes(number);
          })?.[0];
          
          if (memberName) memberNames.push(memberName);
        }
      }
    }


    console.log(`Valid mentions for ${displayName}:`, validMentions);
    console.log(`Member names:`, memberNames);

    // SUSUN PESAN UTAMA
    let messageText = `_Hallo Brainies, pejuang PTN 2026_\n\n`;
    messageText += `KHUSUS untuk jadwal pembelajaran SNBT akan share di grup ini ya, jadi kalau ada temennya yang belum masuk grup ini harap colek colek yaa temen-temen 😊\n\n`;
    messageText += `Jadwal hari ini\n`;
    messageText += `Sesi 1  (17.00 - 20.30)\n- SNBT ${groupId}\n\n`;
    messageText += `Sesi 2  (19.00 - 20.30)\n- SNBT ${groupId}\n\n`;
    messageText += `Info kelasnya sudah Kak Indri share kemarin di atas bisa di-scroll aja ya, atau bisa cek di aplikasi. Jika jadwal belum berubah, masih tahap penyesuaian jadwal kelas terbaru ya. Terima kasih 😊\n\n`;

    // Display custom alias (R1, R2, dst)

    // KIRIM PESAN dengan LID format di mentions
    // await conn.sendMessage(groupId, {
    //   text: messageText,
    //   mentions: validMentions // WhatsApp akan auto-notify yang di-mention
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

    m.reply(`✅ Sukses tag ${displayName}!\n📊 ${validMentions.length}/${targets.length} member berhasil di-mention\n👥 ${memberNames.join(', ')}`);

  } catch (e) {
    console.error('Error di ruangguru command:', e);
    m.reply(`⚠️ Gagal bosku: ${e.message || 'Unknown error'}\n\nCek log untuk detail.`);
  }
};

handler.command = /^(rg[1-5])$/i;

export default handler;