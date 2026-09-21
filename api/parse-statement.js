export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { data: fileData, mediaType } = req.body || {};
  if (!fileData || !mediaType) return res.status(400).json({ error: "Missing file data" });

  const isPdf = mediaType === "application/pdf";

  const content = [
    isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: fileData } }
      : { type: "image",    source: { type: "base64", media_type: mediaType, data: fileData } },
    {
      type: "text",
      text: `Analizá este resumen de tarjeta o banco. Extraé todos los consumos/débitos y devolvé SOLO JSON válido, sin texto extra, con este formato exacto:

{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Nombre del comercio",
      "amount": 1234.56,
      "category": "Comida",
      "type": "gasto",
      "installment_current": null,
      "installment_total": null
    }
  ]
}

Categorías (elegí la más adecuada para cada ítem):
Comida, Transporte, Salud, Servicios, Entretenimiento, Ocio, Ropa, Educación, Hogar, Suscripciones, Otro

Reglas:
- Incluí solo consumos/débitos, ignorá pagos, acreditaciones y devoluciones
- type = "cuota" si detectás patrón X/Y de cuotas (ej: "3/12", "Cuota 2 de 6"); si no, "gasto"
- Para cuotas completá installment_current e installment_total como números
- amount: número positivo sin símbolos
- date: formato YYYY-MM-DD; si falta el año usá el del resumen o el año actual
- description: nombre limpio del comercio, sin códigos ni números de operación`
    }
  ];

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      return res.status(502).json({ error: "API error", detail: err });
    }

    const apiData = await apiRes.json();
    const text = apiData.content?.[0]?.text || "";

    // Extract JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: "No JSON in response", raw: text });

    const parsed = JSON.parse(match[0]);
    return res.json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
