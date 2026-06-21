const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#121826"/>
  <path d="M20 18h24l-4 15a10 10 0 0 1-16 0z" fill="#f4f7fb"/>
  <path d="M23 24h18l-2.5 8.5a7.5 7.5 0 0 1-13 0z" fill="#d55672"/>
  <path d="M32 39v8m-9 0h18" stroke="#f4f7fb" stroke-width="4" stroke-linecap="round"/>
</svg>`;

export function GET() {
  return new Response(faviconSvg, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml",
    },
  });
}
