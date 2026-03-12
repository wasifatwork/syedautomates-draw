import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { exportToBlob } from "@excalidraw/excalidraw";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { elements, appState } = req.body;

    const blob = await exportToBlob({
      elements,
      appState,
      files: null,
      mimeType: "image/png",
    });

    const buffer = Buffer.from(await blob.arrayBuffer());
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
