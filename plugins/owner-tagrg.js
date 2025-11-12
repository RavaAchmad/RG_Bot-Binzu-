import { group } from "console";

let handler = async (m, { conn, text, command }) => {
    // CONFIG AREA
    const ruangguruConfig = {
        'rg1': {
            groupId: '120363391392927133@g.us', // ID GRUP RUANG 1
            displayName: 'R1',
            // List orang-orang yang mau ditag 
            targets: [
                '6281212035575@s.whatsapp.net',
                '456789123456789@lid',         
                '0@s.whatsapp.net' 
            ]
        },
        'rg2': {
            groupId: '120363391392927133@g.us', // ID GRUP RUANG 2
            displayName: 'R2',
            targets: [
                 '628555555555@s.whatsapp.net'  // Cuma satu orang juga bebas
            ]
        },
        'rg3': {
            groupId: '120363391392927133@g.us', // ID GRUP RUANG 3
            displayName: 'R3',
            targets: [

            ]
        },
        'rg4': {
            groupId: '120363391392927133@g.us', // ID GRUP RUANG 4
            displayName: 'R4',
            targets: [
                '6281212035575@s.whatsapp.net',
                '456789123456789@lid',
                '0@s.whatsapp.net'
            ]
        },
        'rg5': {
            groupId: '120363391392927133@g.us', // ID GRUP RUANG 5
            displayName: 'R5',
            targets: [
                '6281212035575@s.whatsapp.net',
                '456789123456789@lid',
                '0@s.whatsapp.net'
            ]
        }
    };

    // Logika Utama
    const config = ruangguruConfig[command];
    if (!config) throw `Waduh, command ${command} belum didaftarin di config nih.`;

    const { groupId, targets } = config;
    const pesan = text ? text : 'Panggilan penting ke ruang guru!';

    try {
        if (!conn.groupCache) conn.groupCache = {}
        if (!conn.groupCache[groupId]) {
            conn.groupCache[groupId] = await conn.groupMetadata(groupId)
            setTimeout(() => delete conn.groupCache[groupId], 5 * 60 * 1000) // refresh tiap 5 menit
        }
        const groupMetadata = conn.groupCache[groupId]
        const currentMembers = groupMetadata.participants.map(p => p.id);
        const validMentions = targets.filter(target => {
             return currentMembers.includes(target) || targets.includes(target); 
        });


        // Kalo ternyata list targetnya kosong (atau udah pada leave semua), kasih fallback
        if (validMentions.length === 0 && targets.length > 0) {
             m.reply('Waduh, target yang mau ditag kayaknya udah gak ada di grup itu deh.');
             return;
        }

        // 3. Susun Pesan
        let messageText = `_Hallo Brainies, pejuang PTN 2026_\n\n`;
        messageText += `KHUSUS untuk jadwal pembelajaran SNBT akan share di grup ini ya, jadi kalau ada temennya yang belum masuk grup ini harap colek colek yaa temen temen 😊\n\n`;
        messageText += `Jadwal hari ini\n`;
        messageText += `Sesi 1  (17.00 - 20.30)\n`;
        messageText += `- SNBT @${displayName}\n\n`;
        messageText += `Sesi 2  (19.00 - 20.30)\n`;
        messageText += `- SNBT @${displayName}\n\n`;
        messageText += `Info kelasnya sudah Kak Indri share kemarin di atas bisa di scroll aja ya atau bisa cek aplikasi temen temen ya. Jika jadwal belum berubah masih dikelas sebelumnya itu masih tahap penyesuaian jadwal kelas terbaru ya. Terima kasih 😊`;

        // Loop buat nambahin tag di teksnya biar keliatan visualnya
        for (let jid of validMentions) {
            messageText += `@${jid.split('@')[0]} `;
        }

        // 4. Kirim!
    conn.sendMessage(
      groupId,
      {
        text: messageText,
        contextInfo: {
          mentionedJid: validMentions,
          groupMentions: [{ groupSubject: `${command}`, groupJid: groupId }]
        }
      }
    );
        
        // Kasih feedback ke sender kalo sukses
        m.reply(`Sukses manggil ${validMentions.length} orang di ${groupMetadata.subject}!`);
    } catch (e) {
        console.error(e); // Selalu log error, jangan males
        m.reply('Gagal bosku. Cek ID grupnya bener gak, atau jangan-jangan botnya udah dikick?');
    }
}

handler.command = /^(rg[1-5])$/i
handler.tags = ['owner']
handler.owner = true

export default handler;