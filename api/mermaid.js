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

    // Mock SVG getBBox which jsdom doesn't support
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
    const { elements } = await parseMermaidToExcalidraw(mermaid);

    return res.status(200).json({
      success: true,
      elementCount: elements?.length
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.split("\n").slice(0,5) });
  }
}
