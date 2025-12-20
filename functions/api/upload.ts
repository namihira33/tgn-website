// 画像アップロードAPI（Cloudflare R2使用）
interface Env {
  BUCKET: R2Bucket;
  ADMIN_PASSWORD: string;
}

// 認証チェック
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

// POST: 画像アップロード
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(JSON.stringify({ error: 'ファイルが必要です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ファイル名を生成（タイムスタンプ + 元のファイル名）
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // R2にアップロード
    await env.BUCKET.put(fileName, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      }
    });

    // 公開URLを返す（R2の公開URLまたはカスタムドメイン）
    const url = `/uploads/${fileName}`;

    return new Response(JSON.stringify({
      success: true,
      url,
      fileName
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({ error: 'アップロードに失敗しました' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
