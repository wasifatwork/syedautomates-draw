export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { elements, appState } = req.body;
    return res.status(200).json({ 
      received: true, 
      elementCount: elements?.length || 0,
      message: "API is working"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
