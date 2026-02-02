// Arka planda çalışacak olan kod
export default async function handler(req, res) {
  const news = await getNews(); // Senin mevcut getNews fonksiyonun
  await kv.set('news', news);   // Veriyi kalıcı depoya yaz
  res.status(200).send('Haberler güncellendi!');
}
