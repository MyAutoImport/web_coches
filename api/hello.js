// api/hello.js
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send('hello from vercel functions');
}
