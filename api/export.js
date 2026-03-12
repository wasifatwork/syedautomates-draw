import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { elements, appState } = req.body;
    const bgColor = appState?.viewBackgroundColor || "#ffffff";
    const width = 1200;
    const height = 800;

    // Build SVG from elements
    let svgElements = "";
    for (const el of elements || []) {
      const stroke = el.strokeColor || "#000000";
      const fill = el.backgroundColor === "transparent" ? "none" : (el.backgroundColor || "none");
      const sw = el.strokeWidth || 1;

      if (el.type === "rectangle") {
        svgElements += `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}"/>`;
      } else if (el.type === "ellipse") {
        svgElements += `<ellipse cx="${el.x + el.width/2}" cy="${el.y + el.height/2}" rx="${el.width/2}" ry="${el.height/2}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}"/>`;
      } else if (el.type === "text") {
        svgElements += `<text x="${el.x}" y="${el.y}" fill="${stroke}" font-size="${el.fontSize || 16}" font-family="sans-serif">${el.text || ""}</text>`;
      } else if (el.type === "line" || el.type === "arrow") {
        const points = el.points || [];
        if (points.length >= 2) {
          const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${el.x + p[0]} ${el.y + p[1]}`).join(" ");
          svgElements += `<path d="${d}" stroke="${stroke}" fill="none" stroke-width="${sw}"/>`;
        }
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${bgColor}"/>
      ${svgElements}
    </svg>`;

    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
      },
    });

    const key = `exports/${Date.now()}.png`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
    }));

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
        Key: key,
      }),
      { expiresIn: 300 }
    );

    return res.status(200).json({ url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
