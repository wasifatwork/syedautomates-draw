import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createCanvas } from "canvas";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { elements, appState } = req.body;
    const bgColor = appState?.viewBackgroundColor || "#ffffff";

    const width = 1200;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Draw elements
    for (const el of elements || []) {
      ctx.strokeStyle = el.strokeColor || "#000000";
      ctx.fillStyle = el.backgroundColor || "transparent";
      ctx.lineWidth = el.strokeWidth || 1;

      if (el.type === "rectangle") {
        ctx.beginPath();
        ctx.rect(el.x, el.y, el.width, el.height);
        ctx.fill();
        ctx.stroke();
      } else if (el.type === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(el.x + el.width/2, el.y + el.height/2, el.width/2, el.height/2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (el.type === "text") {
        ctx.fillStyle = el.strokeColor || "#000000";
        ctx.font = `${el.fontSize || 16}px sans-serif`;
        ctx.fillText(el.text || "", el.x, el.y);
      }
    }

    const buffer = canvas.toBuffer("image/png");

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
