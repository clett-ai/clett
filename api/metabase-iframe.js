import jwt from "jsonwebtoken";

export default async function handler(req, res) {
  try {
    const { dashboardId, h, params } = req.query;
    if (!dashboardId) return res.status(400).json({ error: "dashboardId required" });

    const METABASE_SITE_URL    = process.env.METABASE_SITE_URL;
    const METABASE_EMBED_SECRET = process.env.METABASE_EMBED_SECRET;

    let parsed = {};
    if (params) {
      try { parsed = JSON.parse(params); }
      catch { return res.status(400).json({ error: "invalid params JSON" }); }
    }

    const payload = {
      resource: { dashboard: Number(dashboardId) },
      params: parsed,
      exp: Math.round(Date.now()/1000) + 60*60
    };

    const token = jwt.sign(payload, METABASE_EMBED_SECRET);
    const iframeUrl = `${METABASE_SITE_URL}/embed/dashboard/${token}#bordered=false&titled=false`;

    return res.status(200).json({ iframeUrl, height: h ? Number(h) : 800 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "unexpected error" });
  }
}
