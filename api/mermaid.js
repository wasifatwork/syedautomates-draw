import sharp from "sharp";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM("<!DOCTYPE html>");

    global.window = dom.window;
    global.document = dom.window.document;
    global.DOMParser = dom.window.DOMParser;
    global.DOMPurify = {
      addHook: () => {},
      sanitize: (input) => input,
      isSupported: true,
    };

    dom.window.SVGElement.prototype.getBBox = () => ({
      x: 0, y: 0, width: 100, height: 50
    });
    dom.window.SVGElement.prototype.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 100, height: 50, top: 0, left: 0, bottom: 50, right: 100
    });
    dom.window.Element.prototype.getBBox = () => ({
      x: 0, y: 0, width: 100, height: 50
    });

    const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");

    const { mermaid } = req.body;
    if (!mermaid) {
      return res.status(400).json({ error: "mermaid field is required" });
    }

    const { elements } = await parseMermaidToExcalidraw(mermaid);

    // Calculate canvas bounds with padding
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const el of elements || []) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + (el.width || 0) > maxX) maxX = el.x + (el.width || 0);
      if (el.y + (el.height || 0) > maxY) maxY = el.y + (el.height || 0);
    }
    const padding = 60;
    const offsetX = -minX + padding;
    const offsetY = -minY + padding;
    const canvasW = maxX - minX + padding * 2;
    const canvasH = maxY - minY + padding * 2;

    // Render SVG with Excalidraw pencil style
    let svgElements = "";
    for (const el of elements || []) {
      const x = el.x + offsetX;
      const y = el.y + offsetY;
      const stroke = el.strokeColor || "#1e1e1e";
      const fill = (!el.backgroundColor || el.backgroundColor === "transparent") ? "none" : el.backgroundColor;
      const sw = el.strokeWidth || 1.5;

      if (el.type === "rectangle") {
        svgElements += `<rect x="${x}" y="${y}" width="${el.width}" height="${el.height}"
          stroke="${stroke}" fill="${fill === "none" ? "#fff" : fill}" stroke-width="${sw}" rx="6"
          filter="url(#pencil)"/>`;
      } else if (el.type === "ellipse") {
        svgElements += `<ellipse cx="${x + el.width/2}" cy="${y + el.height/2}"
          rx="${el.width/2}" ry="${el.height/2}"
          stroke="${stroke}" fill="${fill === "none" ? "#fff" : fill}" stroke-width="${sw}"
          filter="url(#pencil)"/>`;
      } else if (el.type === "diamond") {
        const cx = x + el.width/2, cy = y + el.height/2;
        svgElements += `<polygon points="${cx},${y} ${x+el.width},${cy} ${cx},${y+el.height} ${x},${cy}"
          stroke="${stroke}" fill="${fill === "none" ? "#fff" : fill}" stroke-width="${sw}"
          filter="url(#pencil)"/>`;
      } else if (el.type === "text") {
        const lines = (el.text || "").split("\n");
        lines.forEach((line, i) => {
          svgElements += `<text
            x="${x + (el.width || 0)/2}"
            y="${y + (el.fontSize || 16) * (i + 1)}"
            fill="${stroke}"
            font-size="${el.fontSize || 16}"
            font-family="Virgil, Comic Sans MS, cursive"
            text-anchor="middle">${line}</text>`;
        });
      } else if (el.type === "line" || el.type === "arrow") {
        const points = el.points || [];
        if (points.length >= 2) {
          const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x + p[0]} ${y + p[1]}`).join(" ");
          svgElements += `<path d="${d}" stroke="${stroke}" fill="none" stroke-width="${sw}"
            marker-end="${el.type === "arrow" ? "url(#arrowhead)" : ""}"
            filter="url(#pencil)"/>`;
        }
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">
      <defs>
        <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#1e1e1e"/>
        </marker>
      </defs>
      <rect width="${canvasW}" height="${canvasH}" fill="#ffffff"/>
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
    return res.status(500).json({ error: err.message, stack: err.stack?.split("\n").slice(0,5) });
  }
}
