let handler = async (m, { conn, text, command }) => {
  // CONFIG AREA
  const ruangguruConfig = {
    'rg1': {
      groupId: '120363422919131515@g.us',
      displayName: 'R1',
      targets: [
        '6281212035575@s.whatsapp.net',
        '6283830679936@s.whatsapp.net'
      ]
    },
    'rg2': {
      groupId: '120363422919131515@g.us',
      displayName: 'R2',
      targets: ['628555555555@s.whatsapp.net']
    },
    'rg3': {
      groupId: '120363422919131515@g.us',
      displayName: 'R3',
      targets: []
    },
    'rg4': {
      groupId: '120363422919131515@g.us',
      displayName: 'R4',
      targets: ['6281212035575@s.whatsapp.net']
    },
    'rg5': {
      groupId: '120363422919131515@g.us',
      displayName: 'R5',
      targets: ['6281212035575@s.whatsapp.net']
    }
  };

  // CEK CONFIG
  const config = ruangguruConfig[command.toLowerCase()];
  if (!config) return m.reply(`Waduh, command *${command}* belum didaftarin di config nih.`);

  const { groupId, targets, displayName } = config;

  try {
    // Caching metadata buat hindarin rate limit
    if (!conn.groupCache) conn.groupCache = {};
    if (!conn.groupCache[groupId]) {
      conn.groupCache[groupId] = await conn.groupMetadata(groupId);
      setTimeout(() => delete conn.groupCache[groupId], 5 * 60 * 1000);
    }

    const groupMetadata = conn.groupCache[groupId];
    const currentMembers = groupMetadata.participants.map(p => p.id);

    // Filter target yang valid (masih di grup)
    const validMentions = targets.filter(t => currentMembers.includes(t));

    if (validMentions.length === 0) {
      return m.reply(`⚠️ Gak ada target yang valid buat ${displayName}. Cek nomornya atau mereka udah keluar grup.`);
    }

    console.log(`Valid mentions for ${displayName}:`, validMentions);

    // ===== METODE 1: PAKE NOMOR ASLI (DIJAMIN WORK) =====
    // Tapi tampilannya jadi panjang kalau banyak mention
    
    // SUSUN PESAN UTAMA
    let messageText = `_Hallo Brainies, pejuang PTN 2026_\n\n`;
    messageText += `KHUSUS untuk jadwal pembelajaran SNBT akan share di grup ini ya, jadi kalau ada temennya yang belum masuk grup ini harap colek colek yaa temen-temen 😊\n\n`;
    messageText += `Jadwal hari ini\n`;
    messageText += `Sesi 1  (17.00 - 20.30)\n- SNBT @${groupId.split('@')[0]}\n\n`;
    messageText += `Sesi 2  (19.00 - 20.30)\n- SNBT @${groupId.split('@')[0]}\n\n`;
    messageText += `Info kelasnya sudah Kak Indri share kemarin di atas bisa di-scroll aja ya, atau bisa cek di aplikasi. Jika jadwal belum berubah, masih tahap penyesuaian jadwal kelas terbaru ya. Terima kasih 😊\n\n`;

    // ===== METODE 2: CUSTOM ALIAS + HIDDEN MENTION (LEBIH CLEAN) =====
    // Tampilannya pendek (cuma R1, R2) tapi mention tetep nyangkut
    
    // Bikin alias text (R1, R2, dst)
    const aliasText = validMentions.length > 1
      ? validMentions.map((_, i) => `${displayName}${i + 1}`).join(', ')
      : displayName;
    
    messageText += `*Tag:* ${aliasText}\n`;
    
    // Hidden mention (invisible di text, tapi tetep notif)
    // Pakai zero-width space atau tambahin di akhir dengan newline
    const hiddenMentions = validMentions
      .map(jid => `@${jid.split('@')[0]}`)
      .join(' ');
    
    messageText += `\n‎${hiddenMentions}`; // ‎ = zero-width space (U+200E)

    // KIRIM PESAN METODE 2
    await conn.sendMessage(groupId, {
      text: messageText,
      mentions: validMentions
    });

    m.reply(`✅ Sukses manggil ${validMentions.length} orang di ${groupMetadata.subject}!`);

  } catch (e) {
    console.error(e);
    m.reply('⚠️ Gagal bosku. Cek ID grup-nya bener gak, atau bot-nya udah dikick?');
  }
};

handler.command = /^(rg[1-5])$/i;

export default handler;