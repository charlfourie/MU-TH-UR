export function redirectTo(req: Request, path: string, cookies: string[] = []): Response {
  const headers = new Headers({ location: new URL(path, req.url).toString(), 'cache-control': 'no-store' });
  cookies.forEach((value) => headers.append('set-cookie', value));
  return new Response(null, { status: 302, headers });
}
