const express = require('express');
const axios = require('axios');
const { translate } = require('google-translate-api-x');
const path = require('path');
const app = express();

// Statik dosyaları (tasks.js, ammo.js, maps.js) olduğu gibi sunar
app.use(express.static('.'));

let cachedNews = null;
let lastFetchTime = 0;
const CACHE_DURATION = 10 * 60 * 1000;

async function processNews(newsList) {
    return await Promise.all(newsList.map(async (item) => {
        try {
            const titleTr = await translate(item.title, { to: 'tr' });
            const rawContent = item.content_part || item.content_desc || "İçerik mevcut değil.";
            const contentTr = await translate(rawContent, { to: 'tr' });
            return {
                ...item,
                title: titleTr.text,
                content_tr: contentTr.text
            };
        } catch (err) {
            return { ...item, content_tr: item.content_part };
        }
    }));
}

async function getNews() {
    const now = Date.now();
    if (cachedNews && (now - lastFetchTime < CACHE_DURATION)) return cachedNews;

    const apiUrl = 'https://sg-community.playerinfinite.com/api/gpts.information_feeds_svr.InformationFeedsSvr/GetContentByLabel';
    const requestData = {
        "language": ["en"], "gameid": "30048", "offset": 0, "get_num": 10,
        "ext_info_type_list": [0, 1, 2], "secondary_label_id": 1317, "primary_label_id": 893,
        "sort_by_list": [{"key": "start_timestamp", "asc": 0}], "use_default_language": false
    };

    try {
        const response = await axios.post(apiUrl, requestData, {
            headers: {
                'content-type': 'application/json;charset=utf-8',
                'x-areaid': 'global', 'x-gameid': '30048', 'x-language': 'en', 'x-source': 'pc_web',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
            }
        });
        const rawNews = response.data?.data?.info_content || [];
        cachedNews = await processNews(rawNews);
        lastFetchTime = Date.now();
        return cachedNews;
    } catch (e) {
        return cachedNews || [];
    }
}

// GÜNCELLENEN: Haberleri JSON olarak veren ve otomatik güncellenen yapı
app.get('/api/news-json', async (req, res) => {
    const authHeader = req.headers['authorization'];
    
    // Vercel'den gelen gizli şifreyi kontrol eder (Environment Variables'daki CRON_SECRET)
    // Eğer şifre eşleşmezse (yani dışarıdan biri girmeye çalışırsa) 401 hatası verir.
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ 
            success: false, 
            message: 'Yetkisiz erişim. Sadece sistem güncelleyebilir.' 
        });
    }

    try {
        console.log("Sistem otomatik tetiklendi, haberler yenileniyor...");
        const news = await getNews();
        res.json({
            success: true,
            message: "Haberler başarıyla güncellendi.",
            data: news
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Değişmeyen kısım: Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html')); 
});

module.exports = app;
