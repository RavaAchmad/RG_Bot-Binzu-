import { readConfig } from '../json/configManager.js';
import { EventEmitter } from 'events';

// Variabel untuk caching konfigurasi
let commandCache = null;
let commandCacheTime = 0;
const COMMAND_CACHE_DURATION = 1000; // Cache berlaku selama 1 detik

// Handler utama
let handler = async (m, { conn, text, command }) => {
  // Menaikkan batas listener untuk menghindari warning
  EventEmitter.defaultMaxListeners = 20;
  console.log(`[DEBUG] Handler dimulai untuk command: "${command}"`);

  try {
    // --- 1. MEMUAT KONFIGURASI (DATABASE) ---
    const now = Date.now();
    let brainiesDB;
    if (commandCache && (now - commandCacheTime) < COMMAND_CACHE_DURATION) {
      brainiesDB = commandCache;
      console.log('[DEBUG] Menggunakan konfigurasi dari cache.');
    } else {
      console.log('[DEBUG] Membaca konfigurasi dari file `brainiesDB.json`...');
      brainiesDB = await readConfig();
      commandCache = brainiesDB; // Simpan ke cache
      commandCacheTime = now;   // Set waktu cache
      console.log('[DEBUG] Konfigurasi berhasil dimuat dan disimpan ke cache.');
    }

    // --- 2. VALIDASI DATABASE ---
    if (!brainiesDB || Object.keys(brainiesDB).length === 0) {
      console.error('[ERROR] Gagal memuat database. File kosong atau terjadi kesalahan.');
      return m.reply('⚠️ Gagal memuat database brainies. File kosong atau error.');
    }
    // console.log('[DEBUG] Konten brainiesDB:', JSON.stringify(brainiesDB, null, 2));

    // --- 3. EKSTRAKSI GROUP ID ---
    const groupId = Array.isArray(brainiesDB.groupId)
      ? brainiesDB.groupId[0]
      : brainiesDB.groupId || '120363422919131515@g.us'; // Default Group ID
    console.log(`[DEBUG] Group ID yang akan digunakan: ${groupId}`);

    // --- 4. PEMETAAN COMMAND KE NAMA ROOM ---
    const roomMap = {
      'rg1': 'R1',
      'rg2': 'R2',
      'rg3': 'R3',
      'rg4': 'R4',
      'rg5': 'R5'
    };
    const displayName = roomMap[command.toLowerCase()];
    console.log(`[DEBUG] Command "${command}" dipetakan ke room: "${displayName}"`);

    if (!displayName || !brainiesDB[displayName]) {
      console.warn(`[WARN] Command "${command}" tidak memiliki data di database.`);
      return m.reply(`Waduh, command *${command}* belum ada di database nih.`);
    }

    // --- 5. EKSTRAKSI TARGET DARI ROOM YANG DIPILIH ---
    const roomData = brainiesDB[displayName];
    const targets = [];

    console.log(`[DEBUG] Memproses data untuk room "${displayName}"...`);
    for (let [name, numbers] of Object.entries(roomData)) {
      if (Array.isArray(numbers)) {
        // Jika `numbers` adalah array, tambahkan setiap nomor
        targets.push(...numbers.map(num => ({ name, number: num })));
      } else if (typeof numbers === 'string') {
        // Jika `numbers` adalah string, tambahkan langsung
        targets.push({ name, number: numbers });
      }
    }

    if (targets.length === 0) {
      console.warn(`[WARN] Room ${displayName} tidak memiliki member terdaftar.`);
      return m.reply(`⚠️ Room ${displayName} kosong. Belum ada member yang terdaftar.`);
    }
    console.log(`[DEBUG] Total target yang ditemukan di room ${displayName}: ${targets.length}`);
    // console.log('[DEBUG] Daftar semua target:', JSON.stringify(targets, null, 2));

    // --- 6. MENGAMBIL METADATA GRUP (DENGAN CACHING) ---
    if (!conn.groupCache) conn.groupCache = {};
    if (!conn.groupCache[groupId]) {
      console.log(`[DEBUG] Mengambil metadata untuk grup ${groupId} (cache kosong)...`);
      conn.groupCache[groupId] = await conn.groupMetadata(groupId);
      // Hapus cache setelah 5 menit
      setTimeout(() => {
        console.log(`[DEBUG] Cache metadata untuk grup ${groupId} telah dihapus.`);
        delete conn.groupCache[groupId];
      }, 5 * 60 * 1000);
    } else {
      console.log(`[DEBUG] Menggunakan metadata grup ${groupId} dari cache.`);
    }

    const groupMetadata = conn.groupCache[groupId];
    const participants = groupMetadata.participants;
    console.log(`[DEBUG] Berhasil mendapatkan metadata. Total partisipan di grup: ${participants.length}`);

    // --- 7. TRACKING SYSTEM: MEMVALIDASI NOMOR ---
    const validMentions = [];
    const successMembers = [];
    const notInGroupMembers = [];

    // Buat Map untuk pencarian partisipan yang lebih cepat (O(1) average time complexity)
    const participantMap = new Map();
    participants.forEach(p => {
      if (p.id) {
        const phoneMatch = p.id.match(/(\d+)/); // Ekstrak hanya angka dari ID
        if (phoneMatch) {
          participantMap.set(phoneMatch[1], p.id);
        }
      }
    });

    console.log(`[DEBUG] Participant map dibuat. Ukuran map: ${participantMap.size}`);

    // Iterasi melalui setiap target untuk validasi
    for (let target of targets) {
      const { name, number } = target;
      if (!number || typeof number !== 'string') {
        console.warn(`[WARN] Skipping target "${name}" karena nomor tidak valid:`, number);
        continue;
      }
      
      const cleanNumber = number.replace(/\D/g, ''); // Hapus semua karakter non-digit
      let found = false;

      // CARA 1: Cek di participantMap (paling cepat dan akurat)
      if (participantMap.has(cleanNumber)) {
        const participantId = participantMap.get(cleanNumber);
        validMentions.push(participantId);
        successMembers.push({ name, number, lid: participantId });
        console.log(`[SUCCESS] ✅ Ditemukan via Map: ${name} (${number}) -> ${participantId}`);
        found = true;
      }

      // CARA 2: Fallback dengan format JID standar (jika map gagal)
      if (!found) {
        const standardJid = `${cleanNumber}@s.whatsapp.net`;
        if (participants.some(p => p.id === standardJid)) {
          validMentions.push(standardJid);
          successMembers.push({ name, number, lid: standardJid });
          console.log(`[SUCCESS] ✅ Ditemukan via JID: ${name} (${number}) -> ${standardJid}`);
          found = true;
        }
      }
      
      // CARA 3: Fallback dengan format LID (jika JID gagal)
      if (!found) {
        const lidFormat = `${cleanNumber}@lid`;
        if (participants.some(p => p.id === lidFormat)) {
          validMentions.push(lidFormat);
          successMembers.push({ name, number, lid: lidFormat });
          console.log(`[SUCCESS] ✅ Ditemukan via LID: ${name} (${number}) -> ${lidFormat}`);
          found = true;
        }
      }
      
      // JIKA SEMUA GAGAL: Tandai sebagai tidak ditemukan
      if (!found) {
        notInGroupMembers.push({ name, number });
        console.warn(`[FAIL] ❌ Tidak ditemukan di grup: ${name} (${number})`);
      }
    }

    console.log(`[SUMMARY] Total mention valid: ${validMentions.length}`);
    console.log(`[SUMMARY] Total member berhasil: ${successMembers.length}`);
    console.log(`[SUMMARY] Total member tidak ditemukan: ${notInGroupMembers.length}`);

    if (validMentions.length === 0) {
      console.error('[ERROR] Tidak ada member valid yang bisa di-tag.');
      return m.reply(`❌ Tidak ada member yang valid untuk di-tag di room ${displayName}!\n\nKemungkinan:\n• Format nomor di database salah\n• Semua member belum join grup\n• GroupID salah`);
    }

    // --- 8. MENYUSUN DAN MENGIRIM PESAN UTAMA ---
    let messageText = `_Hallo Brainies, pejuang PTN 2026_\n\n` +
                      `KHUSUS untuk jadwal pembelajaran SNBT akan share di grup ini ya, jadi kalau ada temennya yang belum masuk grup ini harap colek colek yaa temen-temen 😊\n\n` +
                      `Jadwal hari ini\n` +
                      `Sesi 1  (17.00 - 20.30)\n- SNBT ${displayName}\n\n` + // Menggunakan displayName agar lebih jelas
                      `Sesi 2  (19.00 - 20.30)\n- SNBT ${displayName}\n\n` +
                      `Info kelasnya sudah Kak Indri share kemarin di atas bisa di-scroll aja ya, atau bisa cek di aplikasi. Jika jadwal belum berubah, masih tahap penyesuaian jadwal kelas terbaru ya. Terima kasih 😊\n\n`;

    console.log(`[ACTION] Mengirim pesan utama ke grup ${groupId} dengan ${validMentions.length} mention...`);
    await conn.sendMessage(groupId, {
      text: messageText,
      contextInfo: {
        mentionedJid: validMentions,
        groupMentions: [
          { groupSubject: `${displayName}`, groupJid: groupId }
        ]
      }
    });
    console.log('[ACTION] Pesan utama berhasil dikirim.');

    // --- 9. MEMBUAT DAN MENGIRIM LAPORAN ---
    let reportText = `✅ *Tag ${displayName} Selesai!*\n\n` +
                     `📊 *Summary:*\n` +
                     `• Total database: ${targets.length} member\n` +
                     `• Berhasil di-tag: ${successMembers.length} member\n` +
                     `• Tidak ditemukan: ${notInGroupMembers.length} member\n\n`;

    if (successMembers.length > 0) {
      reportText += `✅ *Berhasil di-tag:*\n`;
      successMembers.forEach((mem, idx) => {
        reportText += `${idx + 1}. ${mem.name} (${mem.number})\n`;
      });
      reportText += `\n`;
    }

    if (notInGroupMembers.length > 0) {
      reportText += `⚠️ *Nomor Tidak Ditemukan di Grup:*\n` +
                    `_Kemungkinan penyebab:_\n` +
                    `_• Nomor belum join grup ini_\n` +
                    `_• Format nomor salah di database_\n` +
                    `_• Nomor sudah keluar dari grup_\n\n`;
      notInGroupMembers.forEach((mem, idx) => {
        reportText += `${idx + 1}. ${mem.name} → *${mem.number}* ❌\n`;
      });
      reportText += `\n_Cek nomor ini di database & pastikan mereka sudah join grup!_`;
    }

    console.log('[ACTION] Mengirim pesan laporan ke private chat...');
    await m.reply(reportText);
    console.log('[ACTION] Pesan laporan berhasil dikirim. Proses selesai.');

  } catch (e) {
    // --- 10. PENANGANAN ERROR ---
    console.error('--- [FATAL ERROR] Terjadi kesalahan pada command ruangguru ---');
    console.error('Error Message:', e.message);
    console.error('Error Stack:', e.stack);
    console.error('--- End of Error ---');
    m.reply(`⚠️ Gagal total bosku: ${e.message || 'Unknown error'}\n\nCek konsol untuk detail error.`);
  }
};

handler.command = /^(rg[1-5])$/i;

export default handler;