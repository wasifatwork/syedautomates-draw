export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { mermaid } = req.body;

    const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");

    const result = await parseMermaidToExcalidraw(mermaid);

    return res.status(200).json({ 
      success: true,
      elementCount: result.elements?.length 
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.split("\n").slice(0,3) });
  }
}
