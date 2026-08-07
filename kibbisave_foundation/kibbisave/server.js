// ============================================================
// KIBBISAVE — LOCAL SERVER
// npm run dev  →  http://localhost:3000
// (On Vercel, /api/index.js is used instead of this file)
// ============================================================
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KibbiSave running on http://localhost:${PORT}`);
});
