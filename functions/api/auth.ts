// 認証API
interface Env {
  ADMIN_PASSWORD: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const { password } = await request.json() as { password: string };

    if (password === env.ADMIN_PASSWORD) {
      // シンプルなトークン生成（本番ではJWTなどを使用）
      const token = btoa(`admin:${Date.now()}`);

      return new Response(JSON.stringify({ success: true, token }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
        }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'パスワードが違います' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: 'リクエストエラー' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// 認証チェック
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request } = context;

  const cookie = request.headers.get('Cookie') || '';
  const tokenMatch = cookie.match(/auth_token=([^;]+)/);

  if (tokenMatch) {
    try {
      const decoded = atob(tokenMatch[1]);
      if (decoded.startsWith('admin:')) {
        return new Response(JSON.stringify({ authenticated: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch {}
  }

  return new Response(JSON.stringify({ authenticated: false }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
};
