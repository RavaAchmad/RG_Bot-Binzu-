let handler = async (m, { conn, text, command }) => {
  // CONFIG AREA
  const ruangguruConfig = {
    'rg1': {
      groupId: '120363422919131515@g.us',
      displayName: 'R1',
      targets: [
        '6281212035575',
        '6283830679936'
      ]
    },
    'rg2': {
      groupId: '120363422919131515@g.us',
      displayName: 'R2',
      targets: ['628555555555']
    },
    'rg3': {
      groupId: '120363422919131515@g.us',
      displayName: 'R3',
      targets: []
    },
    'rg4': {
      groupId: '120363422919131515@g.us',
      displayName: 'R4',
      targets: ['6281212035575']
    },
    'rg5': {
      groupId: '120363422919131515@g.us',
      displayName: 'R5',
      targets: ['6281212035575']
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
    const participants = groupMetadata.participants;

    // Convert target numbers ke LID format
    const validMentions = [];
    for (let number of targets) {
      // Normalize number (hapus semua non-digit)
      const cleanNumber = number.replace(/\D/g, '');
      const jid = `${cleanNumber}@s.whatsapp.net`;
      
      // Cari participant yang match
      const participant = participants.find(p => {
        const pPhone = p.phoneNumber?.replace(/\D/g, '');
        return pPhone === cleanNumber;
      });
      
      if (participant && participant.id) {
        // Pakai LID dari participant
        validMentions.push(participant.id);
      } else {
        // Fallback: coba convert JID ke LID
        const lid = conn.getLid(jid);
        // Check apakah LID ada di participants
        if (participants.some(p => p.id === lid)) {
          validMentions.push(lid);
        }
      }
    }

    if (validMentions.length === 0) {
      return m.reply(`⚠️ Gak ada target yang valid buat ${displayName}. Cek nomornya atau mereka udah keluar grup.`);
    }

    console.log(`Valid mentions for ${displayName}:`, validMentions);

    // SUSUN PESAN UTAMA
    let messageText = `_Hallo Brainies, pejuang PTN 2026_\n\n`;
    messageText += `KHUSUS untuk jadwal pembelajaran SNBT akan share di grup ini ya, jadi kalau ada temennya yang belum masuk grup ini harap colek colek yaa temen-temen 😊\n\n`;
    messageText += `Jadwal hari ini\n`;
    messageText += `Sesi 1  (17.00 - 20.30)\n- SNBT\n\n`;
    messageText += `Sesi 2  (19.00 - 20.30)\n- SNBT\n\n`;
    messageText += `Info kelasnya sudah Kak Indri share kemarin di atas bisa di-scroll aja ya, atau bisa cek di aplikasi. Jika jadwal belum berubah, masih tahap penyesuaian jadwal kelas terbaru ya. Terima kasih 😊\n\n`;

    // METODE 1: Display custom alias dengan hidden mention
    // Bikin alias text pendek
    const aliasText = validMentions.length > 1
      ? validMentions.map((_, i) => `${displayName}${i + 1}`).join(', ')
      : displayName;
    
    messageText += `*Tag:* ${aliasText}\n`;
    
    // Hidden mention (pakai zero-width space)
    const hiddenMentions = validMentions
      .map(lid => `@${lid.split('@')[0]}`)
      .join(' ');
    
    messageText += `\n‎${hiddenMentions}`; // ‎ = Left-to-Right Mark (U+200E)

    // KIRIM PESAN dengan LID format
    // await conn.sendMessage(groupId, {
    //   text: messageText,
    //   mentions: validMentions // Pakai LID format
    // });
    await conn.sendMessage(groupId, {
      text: messageText,
      contextInfo: {
        mentionedJid: validMentions,
        groupMentions: [
          { groupSubject: `${displayName}`, groupJid: groupId }
        ]
      }
    });

    m.reply(`✅ Sukses manggil ${validMentions.length} orang (${aliasText}) di ${groupMetadata.subject}!`);

  } catch (e) {
    console.error('Error di ruangguru command:', e);
    m.reply(`⚠️ Gagal bosku: ${e.message || 'Unknown error'}`);
  }
};

handler.command = /^(rg[1-5])$/i;

export default handler;