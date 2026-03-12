import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { mermaid } = req.body;

    if (!mermaid) {
      return res.status(400).json({ error: "mermaid field is required" });
    }

    const encoded = Buffer.from(JSON.stringify({
      code: mermaid,
      mermaid: {
        theme: "default"
      },
      updateEditor: false,
      rough: true
    })).toString("base64url");

    const mermaidUrl = `https://mermaid.ink/img/${encoded}`;

    const imgResponse = await fetch(mermaidUrl);
    if (!imgResponse.ok) {
      return res.status(400).json({ error: "Failed to render mermaid diagram" });
    }

    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    const buffer = await sharp(imgBuffer).png().toBuffer();

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
