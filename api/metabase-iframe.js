import jwt from "jsonwebtoken";

export default async function handler(req, res) {
  try {
    const { dashboardId } = req.query;
    if (!dashboardId) return res.status(400).json({ error: "dashboardId required" });

    const METABASE_SITE_URL = process.env.METABASE_SITE_URL;
    const METABASE_EMBED_SECRET = process.env.METABASE_EMBED_SECRET;
    if (!METABASE_SITE_URL || !METABASE_EMBED_SECRET) {
      return res.status(500).json({ error: "Server not configured" });
    }

    const payload = {
      resource: { dashboard: Number(dashboardId) },
      params: {},
      exp: Math.floor(Date.now() / 1000) + 60 * 60
    };

    const token = jwt.sign(payload, METABASE_EMBED_SECRET);
    const iframeUrl = `${METABASE_SITE_URL}/embed/dashboard/${token}#bordered=false&titled=false`;

    return res.status(200).json({ iframeUrl, height: 800 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected error" });
  }
}
