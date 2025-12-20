// 記事CRUD API
interface Env {
  DB: D1Database;
  ADMIN_PASSWORD: string;
}

interface Post {
  id?: number;
  title: string;
  content: string;
  category: string;
  image_url?: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
}

// 認証チェックヘルパー
function isAuthenticated(request: Request): boolean {
  const cookie = request.headers.get('Cookie') || '';
  const tokenMatch = cookie.match(/auth_token=([^;]+)/);

  if (tokenMatch) {
    try {
      const decoded = atob(tokenMatch[1]);
      return decoded.startsWith('admin:');
    } catch {}
  }
  return false;
}

// GET: 記事一覧取得
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  try {
    if (id) {
      // 単一記事取得
      const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
      if (!post) {
        return new Response(JSON.stringify({ error: '記事が見つかりません' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(post), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 全記事取得（published_atを優先して日付順に並べる）
    const { results } = await env.DB.prepare(
      'SELECT * FROM posts ORDER BY COALESCE(published_at, created_at) DESC'
    ).all();

    return new Response(JSON.stringify({ posts: results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'データベースエラー' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST: 記事作成
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const post: Post = await request.json();

    if (!post.title || !post.content) {
      return new Response(JSON.stringify({ error: 'タイトルと本文は必須です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await env.DB.prepare(
      'INSERT INTO posts (title, content, category, image_url, published_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      post.title,
      post.content,
      post.category || 'info',
      post.image_url || null,
      post.published_at || new Date().toISOString().split('T')[0]
    ).run();

    return new Response(JSON.stringify({
      success: true,
      id: result.meta.last_row_id
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '記事の作成に失敗しました' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// PUT: 記事更新
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const post: Post = await request.json();

    if (!post.id) {
      return new Response(JSON.stringify({ error: 'IDが必要です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.DB.prepare(
      'UPDATE posts SET title = ?, content = ?, category = ?, image_url = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(
      post.title,
      post.content,
      post.category || 'info',
      post.image_url || null,
      post.published_at || new Date().toISOString().split('T')[0],
      post.id
    ).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '記事の更新に失敗しました' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// DELETE: 記事削除
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ error: 'IDが必要です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '記事の削除に失敗しました' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
