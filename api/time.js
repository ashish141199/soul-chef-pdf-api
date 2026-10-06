export default function handler(req, res) {
  const now = new Date();

  res.status(200).json({
    success: true,
    time: now.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "long"
    }),
    iso: now.toISOString(),
    timestamp: Date.now()
  });
}
