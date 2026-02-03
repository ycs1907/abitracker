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
    return Promise.all(newsList.map(async (item) => {
        const rawContent =
            item.content_part || item.content_desc || "İçerik mevcut değil.";

        // Haberin imzası (başlık + içerik)
        const signature = hashText(item.title + rawContent);

        // ✅ Cache HIT
        if (newsTranslateCache.has(signature)) {
            const cached = newsTranslateCache.get(signature);
            return {
                ...item,
                title: cached.title_tr,
                content_tr: cached.content_tr
            };
        }

        // ❌ Cache MISS → sadece bu haber çevrilir
        try {
            const [titleRes, contentRes] = await Promise.all([
                translate(item.title, { to: 'tr' }),
                translate(rawContent, { to: 'tr' })
            ]);

            const translated = {
                title_tr: titleRes.text,
                content_tr: contentRes.text
            };

            // Cache’e yaz
            newsTranslateCache.set(signature, translated);

            return {
                ...item,
                title: translated.title_tr,
                content_tr: translated.content_tr
            };
        } catch (err) {
            return {
                ...item,
                content_tr: rawContent
            };
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

// GÜNCELLENEN: Hem Cron hem de Kullanıcı dostu yapı
app.get('/api/news-json', async (req, res) => {
    // BU SATIR ÇOK ÖNEMLİ: Vercel'in bu veriyi hafızasında saklamasını sağlar
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');

    const authHeader = req.headers['authorization'];
    
    // Vercel Cron veya cPanel Cron tetiklendiğinde log düşer
    if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
        console.log("Cron başarılı bir şekilde tetiklendi.");
    }

    try {
        // Artık veriyi getNews içinden alıyoruz
        const news = await getNews();
        
        // Tarayıcıya hazır (çevrilmiş) JSON gönderiyoruz
        res.json(news); 

    } catch (error) {
        console.error("Haber çekme hatası:", error.message);
        res.status(500).json({ success: false, error: "Haberler şu an alınamadı." });
    }
});

// Değişmeyen kısım: Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html')); 
});

module.exports = app;




