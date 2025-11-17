import fetch from 'node-fetch';

// Fungsi sleep-nya udah oke, kita pake lagi aja
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) throw `URL-nya mana, bestie? Contoh: ${usedPrefix}${command} https://www.instagram.com/p/C05s-5QyL4j/`;

    // Regex buat mastiin link-nya beneran dari Instagram. Biar ga error aneh-aneh.
    const instagramUrlRegex = /^(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[a-zA-Z0-9\-_]+)/;
    if (!instagramUrlRegex.test(text)) {
        throw 'Ini link Instagram bukan sih? Coba cek lagi deh.';
    }

    try {
        m.reply('Sabar ya, lagi di-download...'); // Kasih notif biar user tau lagi proses

        const api = await fetch(`https://api.deline.web.id/downloader/ig?url=${encodeURIComponent(text)}`);
        const res = await api.json();

        // Check dulu status dari API-nya, jangan main hajar aja
        if (!res.status || !res.result) {
            throw new Error('Gagal ngambil data dari API, kayaknya lagi down.');
        }

        // Nah, ini bagian pentingnya. Kita gabungin array 'images' dan 'videos'
        const { images, videos } = res.result.media;
        const allMediaUrls = [...images, ...videos]; // Pake spread operator biar keren

        if (allMediaUrls.length === 0 || allMediaUrls.every(url => !url)) {
            m.reply("Duh, post-nya ga ada media yang bisa di-download nih. Mungkin private atau udah dihapus?");
            return;
        }

        // Ngefilter URL yang kosong atau duplikat. Pake Set itu udah asek.
        const uniqueUrls = [...new Set(allMediaUrls.filter(url => url))];
        
        const limitnya = 10; // Jangan 999 juga bro, kasian servernya, ntar kena rate limit nangis. 10 aja cukup.
        for (let i = 0; i < Math.min(limitnya, uniqueUrls.length); i++) {
            await sleep(2000); // Kasih jeda, jangan bar-bar
            conn.sendFile(m.chat, uniqueUrls[i], null, `*Udah kelar nih, bos!*`, m);
        }

    } catch (e) {
        console.error(e); // Pake console.error biar lebih jelas kalo ada masalah
        m.reply('Yah, error. Servernya lagi ngambek atau link-nya ga bener. Coba lagi nanti.');
    }
};

handler.help = ['instagram'].map(v => v + ' <url>');
handler.tags = ['downloader'];
handler.command = /^(ig|instagram|igdl|instagramdl|igstroy)$/i;
handler.limit = true;

export default handler;