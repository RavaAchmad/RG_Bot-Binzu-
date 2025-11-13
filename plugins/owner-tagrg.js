let handler = async (m, { conn, command, text }) => {
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
      targets: [
        '6281212035575@s.whatsapp.net'
      ]
    },
    'rg5': {
      groupId: '120363422919131515@g.us',
      displayName: 'R5',
      targets: [
        '6281212035575@s.whatsapp.net'
      ]
    }
  };

  // CEK CONFIG
  const config = ruangguruConfig[command.toLowerCase()];
  if (!config) return m.reply(`Waduh, command *${command}* belum didaftarin di config nih.`);

  const { groupId, targets, displayName } = config;
  const pesan = text || 'Panggilan penting ke ruang guru!';

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

    console.log(`Valid mentions for ${displayName}:`, validMentions);
    // SUSUN PESAN UTAMA
    let messageText = `_Hallo Brainies, pejuang PTN 2026_\n\n`;
    messageText += `KHUSUS untuk jadwal pembelajaran SNBT akan share di grup ini ya, jadi kalau ada temennya yang belum masuk grup ini harap colek colek yaa temen-temen 😊\n\n`;
    messageText += `Jadwal hari ini\n`;
    messageText += `Sesi 1  (17.00 - 20.30)\n- SNBT @${displayName}\n\n`;
    messageText += `Sesi 2  (19.00 - 20.30)\n- SNBT @${displayName}\n\n`;
    messageText += `Info kelasnya sudah Kak Indri share kemarin di atas bisa di-scroll aja ya, atau bisa cek di aplikasi. Jika jadwal belum berubah, masih tahap penyesuaian jadwal kelas terbaru ya. Terima kasih 😊\n\n`;

    // TAMBAHIN MENTION
    const aliasMention = validMentions.length > 1
      ? validMentions.map((jid, i) => `@${displayName}${i + 1}`).join(' ')
      : `@${displayName}`;

    messageText += aliasMention;

    // KIRIM PESAN
    await conn.sendMessage(groupId, {
      text: messageText,
      contextInfo: {
        mentionedJid: validMentions,
        groupMentions: [
          { groupSubject: `${displayName}`, groupJid: groupId }
        ]
      }
    });

    m.reply(`✅ Sukses manggil ${validMentions.length} orang di ${groupMetadata.subject}!`);

  } catch (e) {
    console.error(e);
    m.reply('⚠️ Gagal bosku. Cek ID grup-nya bener gak, atau bot-nya udah dikick?');
  }
};

handler.command = /^(rg[1-5])$/i;
handler.tags = ['owner'];
handler.owner = true;

export default handler;