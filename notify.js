// Vercel serverless function: sends a Telegram alert to the admin when a user submits
// a deposit, withdrawal or task screenshot. The bot token stays on the server (env vars).
const PROJECT = "yoto-8b2dd";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { col, id } = req.body || {};
  if (!token || !["deposits", "withdrawals", "submissions"].includes(col) || !/^[A-Za-z0-9]{10,40}$/.test(id || ""))
    return res.status(400).json({ error: "bad request" });

  // Read the document with the user's own token, so Firestore Rules decide if they may see it
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${col}/${id}`, {
    headers: { Authorization: "Bearer " + token }
  });
  if (!r.ok) return res.status(403).json({ error: "denied" });
  const doc = await r.json();
  const f = doc.fields || {};
  const g = k => { const v = f[k]; return v ? (v.stringValue ?? v.integerValue ?? v.doubleValue ?? "") : ""; };

  // Only fresh, pending requests (stops old documents from being re-sent)
  if (Date.now() - Date.parse(doc.createTime) > 180000 || g("status") !== "pending")
    return res.status(200).json({ ok: false });

  let text;
  if (col === "deposits") text = `New deposit request\n${g("email")}\nAmount: Rs ${g("amount")}\nUTR: ${g("utr")}\n${g("shot")}`;
  else if (col === "withdrawals") text = `New withdrawal request\n${g("email")}\nAmount: Rs ${g("amount")}\nUPI: ${g("upi")}`;
  else text = `New task screenshot\n${g("email")}\n${g("shot")}`;

  const t = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
  });
  return res.status(200).json({ ok: t.ok });
};
